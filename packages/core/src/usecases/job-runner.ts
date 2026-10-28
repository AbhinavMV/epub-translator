import type { JobSummary, TranslateBody } from "@et/contracts";
import { CONTENTS_CHAPTER_ID, type ParsedBook, type ParsedChapter } from "../domain/book.ts";
import {
  BatchNotSupportedError,
  FatalProviderError,
  NotFoundError,
  ProviderNotConfiguredError,
} from "../domain/errors.ts";
import type { Job } from "../domain/job.ts";
import type { JobEventSink } from "../ports/events.ts";
import type { Repositories, StoreFactory } from "../ports/stores.ts";
import type { Sleep } from "../ports/system.ts";
import type { TranslationProvider } from "../ports/translation-provider.ts";
import type { WorkLeaseFactory } from "../ports/work-lease.ts";
import { batchSegments } from "../translation/batcher.ts";
import { SegmentTranslator } from "../translation/translate-segments.ts";
import { type BatchDeps, BatchRunner } from "./batch-runner.ts";
import { chapterSegmentIds, chapterWork } from "./chapter-work.ts";
import { type ChapterRuntime, chapterProgress, jobSummary } from "./job-progress.ts";
import { requireBook } from "./load-book.ts";
import { translatedTitles } from "./translated-titles.ts";
import { recordResults } from "./work/record-results.ts";
import { segmentRequest } from "./work/request.ts";

export interface JobRunnerDeps {
  factory: StoreFactory;
  providers: (id: TranslateBody["provider"]) => TranslationProvider | null;
  events: JobEventSink;
  sleep: Sleep;
  batch?: BatchDeps;
  leases?: WorkLeaseFactory;
}

export interface JobRunnerOptions {
  chapterConcurrency: number;
  contextSize: number;
  maxChars: number;
  maxCount: number;
}

interface Task {
  ownerId: string;
  jobId: string;
  chapterId: string;
  body: TranslateBody;
  provider: TranslationProvider;
  controller: AbortController;
}

interface Submission {
  ownerId: string;
  jobId: string;
  chapterId: string;
  cancelled: boolean;
}

const key = (jobId: string, chapterId: string) => `${jobId}\u0000${chapterId}`;

export class JobRunner {
  private readonly queue: Task[] = [];
  private readonly active = new Map<string, Task>();
  private readonly submissions = new Map<string, Submission>();
  private readonly runtime = new Map<string, ChapterRuntime>();
  private readonly errors = new Map<string, string>();
  private readonly batches: BatchRunner | null;
  private finalizing = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly deps: JobRunnerDeps,
    private readonly options: JobRunnerOptions = {
      chapterConcurrency: 2,
      contextSize: 8,
      maxChars: 4000,
      maxCount: 40,
    },
  ) {
    this.batches = deps.batch ? new BatchRunner({ ...deps, batch: deps.batch }, options) : null;
  }

  async translateChapter(
    ownerId: string,
    jobId: string,
    chapterId: string,
    body: TranslateBody,
  ): Promise<void> {
    const { parsed } = await this.requireJob(this.reposOf(ownerId), jobId);
    this.requireChapter(parsed, chapterId);
    await this.enqueue(ownerId, jobId, chapterId, body, this.requireProvider(body));
  }

  async translateAll(ownerId: string, jobId: string, body: TranslateBody): Promise<void> {
    const repos = this.reposOf(ownerId);
    const { job, parsed } = await this.requireJob(repos, jobId);
    const provider = this.requireProvider(body);
    const translations = await repos.translations.forJob(jobId);
    const contentsFirst = [...parsed.chapters].sort(
      (a, b) => Number(b.id === CONTENTS_CHAPTER_ID) - Number(a.id === CONTENTS_CHAPTER_ID),
    );
    for (const chapter of contentsFirst) {
      const p = chapterProgress(parsed, chapter.id, translations, undefined, null);
      if (p.status !== "done") await this.enqueue(ownerId, job.id, chapter.id, body, provider);
    }
  }

  async retryChapter(
    ownerId: string,
    jobId: string,
    chapterId: string,
    body: TranslateBody,
  ): Promise<void> {
    const provider = this.requireProvider(body);
    await this.clearChapter(ownerId, jobId, chapterId);
    await this.enqueue(ownerId, jobId, chapterId, body, provider);
  }

  async clearChapter(ownerId: string, jobId: string, chapterId: string): Promise<void> {
    const repos = this.reposOf(ownerId);
    const { parsed } = await this.requireJob(repos, jobId);
    const chapter = this.requireChapter(parsed, chapterId);
    this.stop(jobId, (t) => t.chapterId === chapterId);
    this.errors.delete(key(jobId, chapterId));
    await this.cancelBatches(ownerId, jobId, chapterId);
    await this.deps.leases?.forOwner(ownerId).releaseForChapter(jobId, chapterId);
    await repos.translations.deleteMany(
      jobId,
      parsed.segments.filter((s) => s.chapterId === chapter.id).map((s) => s.id),
    );
    await this.publishChapter(repos, jobId, parsed, chapterId);
  }

  async cancel(ownerId: string, jobId: string): Promise<void> {
    const repos = this.reposOf(ownerId);
    await this.requireJob(repos, jobId);
    this.stop(jobId, () => true);
    await this.cancelBatches(ownerId, jobId);
    await this.deps.leases?.forOwner(ownerId).releaseForJob(jobId);
    await this.publishJob(repos, jobId);
  }

  async pollBatches(ownerId: string): Promise<void> {
    if (!this.batches) return;
    const repos = this.reposOf(ownerId);
    for (const t of await this.batches.poll(repos)) {
      if (t.error) this.errors.set(key(t.jobId, t.chapterId), t.error);
      const job = await repos.jobs.get(t.jobId);
      const parsed = job ? await repos.books.getParsed(job.bookId) : null;
      if (!parsed) continue;
      await this.publishChapter(repos, t.jobId, parsed, t.chapterId);
      await this.publishJob(repos, t.jobId);
    }
  }

  async summary(ownerId: string, jobId: string): Promise<JobSummary> {
    return this.summaryOf(this.reposOf(ownerId), jobId);
  }

  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private reposOf(ownerId: string): Repositories {
    return this.deps.factory.forOwner(ownerId);
  }

  private async summaryOf(repos: Repositories, jobId: string): Promise<JobSummary> {
    const { job, parsed } = await this.requireJob(repos, jobId);
    const translations = await repos.translations.forJob(jobId);
    const progress = [];
    for (const c of parsed.chapters) {
      progress.push(
        chapterProgress(
          parsed,
          c.id,
          translations,
          await this.runtimeOf(repos, jobId, c.id),
          this.errors.get(key(jobId, c.id)) ?? null,
        ),
      );
    }
    return jobSummary(job, progress, translatedTitles(parsed, translations));
  }

  private isIdle(): boolean {
    return (
      this.queue.length === 0 &&
      this.active.size === 0 &&
      this.submissions.size === 0 &&
      this.finalizing === 0
    );
  }

  private async runtimeOf(
    repos: Repositories,
    jobId: string,
    chapterId: string,
  ): Promise<ChapterRuntime | undefined> {
    const live = this.runtime.get(key(jobId, chapterId));
    if (live) return live;
    return this.batches && (await this.batches.hasOpen(repos, jobId, chapterId))
      ? { status: "submitted" }
      : undefined;
  }

  private async requireJob(
    repos: Repositories,
    jobId: string,
  ): Promise<{ job: Job; parsed: ParsedBook }> {
    const job = await repos.jobs.get(jobId);
    if (!job) throw new NotFoundError("Job", jobId);
    return { job, parsed: (await requireBook(repos.books, job.bookId)).parsed };
  }

  private requireChapter(parsed: ParsedBook, chapterId: string): ParsedChapter {
    const chapter = parsed.chapters.find((c) => c.id === chapterId);
    if (!chapter) throw new NotFoundError("Chapter", chapterId);
    return chapter;
  }

  private requireProvider(body: TranslateBody): TranslationProvider | null {
    if (body.mode === "batch") {
      if (!this.batches?.supports(body.provider)) throw new BatchNotSupportedError(body.provider);
      return null;
    }
    const provider = this.deps.providers(body.provider);
    if (!provider) throw new ProviderNotConfiguredError(body.provider);
    return provider;
  }

  private async enqueue(
    ownerId: string,
    jobId: string,
    chapterId: string,
    body: TranslateBody,
    provider: TranslationProvider | null,
  ): Promise<void> {
    const repos = this.reposOf(ownerId);
    const k = key(jobId, chapterId);
    if (this.runtime.has(k) || (await this.batches?.hasOpen(repos, jobId, chapterId))) return;
    // Everything from here to the queue push is synchronous so concurrent enqueues cannot interleave.
    if (this.runtime.has(k)) return;
    this.errors.delete(k);
    this.runtime.set(k, { status: "queued" });
    if (provider) {
      this.queue.push({
        ownerId,
        jobId,
        chapterId,
        body,
        provider,
        controller: new AbortController(),
      });
    } else {
      this.submit(ownerId, jobId, chapterId, body);
    }
    try {
      if ((await repos.jobs.get(jobId))?.error) await repos.jobs.update(jobId, { error: null });
      await this.publishChapter(
        repos,
        jobId,
        (await this.requireJob(repos, jobId)).parsed,
        chapterId,
      );
      await this.publishJob(repos, jobId);
    } catch (err) {
      this.stop(jobId, (t) => t.chapterId === chapterId);
      throw err;
    }
    this.pump();
  }

  private submit(ownerId: string, jobId: string, chapterId: string, body: TranslateBody): void {
    const k = key(jobId, chapterId);
    const submission: Submission = { ownerId, jobId, chapterId, cancelled: false };
    this.submissions.set(k, submission);
    this.finalizing++;
    void (this.batches as BatchRunner)
      .submit(this.reposOf(ownerId), jobId, chapterId, body, () => submission.cancelled)
      .catch((err: unknown) => {
        if (!submission.cancelled) {
          this.errors.set(k, err instanceof Error ? err.message : String(err));
        }
      })
      .then(async () => {
        if (this.submissions.get(k) === submission) {
          this.submissions.delete(k);
          this.runtime.delete(k);
        }
        await this.safePublish(ownerId, jobId, chapterId);
      })
      .finally(() => {
        this.finalizing--;
        this.notifyIdle();
      });
  }

  private async cancelBatches(ownerId: string, jobId: string, chapterId?: string): Promise<void> {
    for (const [k, submission] of this.submissions) {
      if (submission.jobId !== jobId) continue;
      if (chapterId !== undefined && submission.chapterId !== chapterId) continue;
      submission.cancelled = true;
      this.submissions.delete(k);
      this.runtime.delete(k);
    }
    this.notifyIdle();
    const repos = this.reposOf(ownerId);
    if (chapterId === undefined) await this.batches?.cancelJob(repos, jobId);
    else await this.batches?.cancelChapter(repos, jobId, chapterId);
  }

  private stop(jobId: string, match: (t: Task) => boolean): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const task = this.queue[i] as Task;
      if (task.jobId === jobId && match(task)) {
        this.queue.splice(i, 1);
        this.runtime.delete(key(task.jobId, task.chapterId));
      }
    }
    for (const [k, task] of this.active) {
      if (task.jobId === jobId && match(task)) {
        task.controller.abort();
        this.active.delete(k);
        this.runtime.delete(k);
      }
    }
    this.pump();
    this.notifyIdle();
  }

  private pump(): void {
    while (this.active.size < this.options.chapterConcurrency && this.queue.length > 0) {
      const task = this.queue.shift() as Task;
      const k = key(task.jobId, task.chapterId);
      this.active.set(k, task);
      this.runtime.set(k, { status: "running" });
      this.finalizing++;
      void this.runTask(task)
        .catch((err: unknown) => {
          if (!task.controller.signal.aborted) {
            this.errors.set(k, err instanceof Error ? err.message : String(err));
          }
        })
        .then(async () => {
          if (this.active.get(k) === task) {
            this.active.delete(k);
            this.runtime.delete(k);
          }
          this.pump();
          await this.safePublish(task.ownerId, task.jobId, task.chapterId);
        })
        .finally(() => {
          this.finalizing--;
          this.notifyIdle();
        });
    }
  }

  private async safePublish(ownerId: string, jobId: string, chapterId: string): Promise<void> {
    try {
      const repos = this.reposOf(ownerId);
      const job = await repos.jobs.get(jobId);
      const parsed = job ? await repos.books.getParsed(job.bookId) : null;
      if (!parsed) return;
      await this.publishChapter(repos, jobId, parsed, chapterId);
      await this.publishJob(repos, jobId);
    } catch {
      // Publishing is best-effort; the next poll or reload recomputes progress from the store.
    }
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const w of waiters) w();
  }

  private async runTask(task: Task): Promise<void> {
    const repos = this.reposOf(task.ownerId);
    const aborted = () => task.controller.signal.aborted;
    const job = await repos.jobs.get(task.jobId);
    const parsed = job ? await repos.books.getParsed(job.bookId) : null;
    if (!job || !parsed || aborted()) return;
    await this.publishChapter(repos, task.jobId, parsed, task.chapterId);
    await this.publishJob(repos, task.jobId);

    const settings = await repos.settings.get(job.bookId);
    const requestContext = { job, parsed, settings, contextSize: this.options.contextSize };
    const translator = new SegmentTranslator(task.provider, this.deps.sleep);
    const segments = parsed.segments.filter((s) => s.chapterId === task.chapterId);
    const { pending, context } = chapterWork(
      segments,
      await repos.translations.forSegments(
        task.jobId,
        segments.map((s) => s.id),
      ),
    );

    try {
      for (const batch of batchSegments(pending, this.options.maxChars, this.options.maxCount)) {
        if (aborted()) return;
        const outcome = await translator.translateBatch(
          segmentRequest(requestContext, task.body.model, batch, context),
          task.controller.signal,
        );
        if (aborted()) return;
        const sourceOf = new Map(batch.map((s) => [s.id, s.sourceText]));
        const recorded = await recordResults(repos, this.deps.events, {
          jobId: task.jobId,
          chapterId: task.chapterId,
          usage: outcome.usage,
          entries: batch.flatMap((s) => {
            const result = outcome.results.get(s.id);
            return result ? [[s.id, result] as const] : [];
          }),
          isStopped: aborted,
          onRecorded: (id, result) => {
            if (result.status === "done") {
              context.push({ source: sourceOf.get(id) ?? "", target: result.text });
            }
          },
        });
        if (!recorded) return;
        if (aborted()) return;
        await this.publishChapter(repos, task.jobId, parsed, task.chapterId);
      }
    } catch (err) {
      if (aborted()) return;
      const message = err instanceof Error ? err.message : String(err);
      this.errors.set(key(task.jobId, task.chapterId), message);
      if (err instanceof FatalProviderError) {
        this.stop(task.jobId, (t) => t !== task);
        await repos.jobs.update(task.jobId, { error: message });
      }
    }
  }

  private async publishChapter(
    repos: Repositories,
    jobId: string,
    parsed: ParsedBook,
    chapterId: string,
  ): Promise<void> {
    const translations = await repos.translations.forSegments(
      jobId,
      chapterSegmentIds(parsed, chapterId),
    );
    const runtime = await this.runtimeOf(repos, jobId, chapterId);
    this.deps.events.publish({
      type: "chapter.progress",
      jobId,
      progress: chapterProgress(
        parsed,
        chapterId,
        translations,
        runtime,
        this.errors.get(key(jobId, chapterId)) ?? null,
      ),
    });
  }

  private async publishJob(repos: Repositories, jobId: string): Promise<void> {
    this.deps.events.publish({ type: "job.status", job: await this.summaryOf(repos, jobId) });
  }
}
