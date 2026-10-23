import {
  type GlossaryEntry,
  getTargetLanguage,
  type JobSummary,
  type TranslateBody,
} from "@et/contracts";
import type { ParsedBook, ParsedChapter, ParsedSegment } from "../domain/book.ts";
import { FatalProviderError, NotFoundError, ProviderNotConfiguredError } from "../domain/errors.ts";
import type { Job } from "../domain/job.ts";
import type { JobEventSink } from "../ports/events.ts";
import type {
  BookRepository,
  BookSettingsRepository,
  JobRepository,
  TranslationRepository,
} from "../ports/stores.ts";
import type { Sleep } from "../ports/system.ts";
import type { TranslationProvider } from "../ports/translation-provider.ts";
import { batchSegments } from "../translation/batcher.ts";
import { SegmentTranslator } from "../translation/translate-segments.ts";
import { type ChapterRuntime, chapterProgress, jobSummary } from "./job-progress.ts";
import { requireBook } from "./load-book.ts";

export interface JobRunnerDeps {
  books: BookRepository;
  jobs: JobRepository;
  translations: TranslationRepository;
  settings: BookSettingsRepository;
  providers: (id: TranslateBody["provider"]) => TranslationProvider | null;
  events: JobEventSink;
  sleep: Sleep;
}

export interface JobRunnerOptions {
  chapterConcurrency: number;
  contextSize: number;
  maxChars: number;
  maxCount: number;
}

interface Task {
  jobId: string;
  chapterId: string;
  body: TranslateBody;
  provider: TranslationProvider;
  controller: AbortController;
}

const key = (jobId: string, chapterId: string) => `${jobId}\u0000${chapterId}`;

export class JobRunner {
  private readonly queue: Task[] = [];
  private readonly active = new Map<string, Task>();
  private readonly runtime = new Map<string, ChapterRuntime>();
  private readonly errors = new Map<string, string>();
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly deps: JobRunnerDeps,
    private readonly options: JobRunnerOptions = {
      chapterConcurrency: 2,
      contextSize: 8,
      maxChars: 4000,
      maxCount: 40,
    },
  ) {}

  translateChapter(jobId: string, chapterId: string, body: TranslateBody): void {
    const { parsed } = this.requireJob(jobId);
    this.requireChapter(parsed, chapterId);
    this.enqueue(jobId, chapterId, body, this.requireProvider(body));
  }

  translateAll(jobId: string, body: TranslateBody): void {
    const { job, parsed } = this.requireJob(jobId);
    const provider = this.requireProvider(body);
    const translations = this.deps.translations.forJob(jobId);
    for (const chapter of parsed.chapters) {
      const p = chapterProgress(parsed, chapter.id, translations, undefined, null);
      if (p.status !== "done") this.enqueue(job.id, chapter.id, body, provider);
    }
  }

  retryChapter(jobId: string, chapterId: string, body: TranslateBody): void {
    const provider = this.requireProvider(body);
    this.clearChapter(jobId, chapterId);
    this.enqueue(jobId, chapterId, body, provider);
  }

  clearChapter(jobId: string, chapterId: string): void {
    const { parsed } = this.requireJob(jobId);
    const chapter = this.requireChapter(parsed, chapterId);
    this.stop(jobId, (t) => t.chapterId === chapterId);
    this.errors.delete(key(jobId, chapterId));
    this.deps.translations.deleteMany(
      jobId,
      parsed.segments.filter((s) => s.chapterId === chapter.id).map((s) => s.id),
    );
    this.publishChapter(jobId, parsed, chapterId);
  }

  cancel(jobId: string): void {
    this.requireJob(jobId);
    this.stop(jobId, () => true);
    this.publishJob(jobId);
  }

  summary(jobId: string): JobSummary {
    const { job, parsed } = this.requireJob(jobId);
    const translations = this.deps.translations.forJob(jobId);
    return jobSummary(
      job,
      parsed.chapters.map((c) =>
        chapterProgress(
          parsed,
          c.id,
          translations,
          this.runtime.get(key(jobId, c.id)),
          this.errors.get(key(jobId, c.id)) ?? null,
        ),
      ),
    );
  }

  whenIdle(): Promise<void> {
    if (this.queue.length === 0 && this.active.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private requireJob(jobId: string): { job: Job; parsed: ParsedBook } {
    const job = this.deps.jobs.get(jobId);
    if (!job) throw new NotFoundError("Job", jobId);
    return { job, parsed: requireBook(this.deps.books, job.bookId).parsed };
  }

  private requireChapter(parsed: ParsedBook, chapterId: string): ParsedChapter {
    const chapter = parsed.chapters.find((c) => c.id === chapterId);
    if (!chapter) throw new NotFoundError("Chapter", chapterId);
    return chapter;
  }

  private requireProvider(body: TranslateBody): TranslationProvider {
    const provider = this.deps.providers(body.provider);
    if (!provider) throw new ProviderNotConfiguredError(body.provider);
    return provider;
  }

  private enqueue(
    jobId: string,
    chapterId: string,
    body: TranslateBody,
    provider: TranslationProvider,
  ): void {
    const k = key(jobId, chapterId);
    if (this.runtime.has(k)) return;
    this.errors.delete(k);
    this.runtime.set(k, { status: "queued" });
    this.queue.push({ jobId, chapterId, body, provider, controller: new AbortController() });
    this.publishChapter(jobId, this.requireJob(jobId).parsed, chapterId);
    this.publishJob(jobId);
    this.pump();
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
      void this.runTask(task)
        .catch((err: unknown) => {
          if (!task.controller.signal.aborted) {
            this.errors.set(k, err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (this.active.get(k) === task) {
            this.active.delete(k);
            this.runtime.delete(k);
          }
          this.safePublish(task);
          this.pump();
          this.notifyIdle();
        });
    }
  }

  private safePublish(task: Task): void {
    const job = this.deps.jobs.get(task.jobId);
    const parsed = job ? this.deps.books.getParsed(job.bookId) : null;
    if (!parsed) return;
    this.publishChapter(task.jobId, parsed, task.chapterId);
    this.publishJob(task.jobId);
  }

  private notifyIdle(): void {
    if (this.queue.length > 0 || this.active.size > 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const w of waiters) w();
  }

  private async runTask(task: Task): Promise<void> {
    const job = this.deps.jobs.get(task.jobId);
    const parsed = job ? this.deps.books.getParsed(job.bookId) : null;
    if (!job || !parsed) return;
    this.publishChapter(task.jobId, parsed, task.chapterId);
    this.publishJob(task.jobId);

    const settings = this.deps.settings.get(job.bookId);
    const translator = new SegmentTranslator(task.provider, this.deps.sleep);
    const segments = parsed.segments.filter((s) => s.chapterId === task.chapterId);
    const existing = this.deps.translations.forJob(task.jobId);
    const context = this.initialContext(segments, existing);
    const pending = segments.filter((s) => {
      const t = existing.get(s.id);
      return !t || t.status === "failed";
    });

    try {
      for (const batch of batchSegments(pending, this.options.maxChars, this.options.maxCount)) {
        if (task.controller.signal.aborted) return;
        const outcome = await translator.translateBatch(
          {
            model: task.body.model,
            sourceLang: job.sourceLang,
            target: getTargetLanguage(job.targetLang),
            bookTitle: parsed.title,
            context: context.slice(-this.options.contextSize),
            segments: batch.map((s) => ({ id: s.id, text: s.sourceText })),
            ...this.promptExtras(settings.customPrompt, settings.glossary),
          },
          task.controller.signal,
        );
        if (task.controller.signal.aborted) return;
        this.deps.jobs.addUsage(task.jobId, outcome.usage);
        for (const segment of batch) {
          const result = outcome.results.get(segment.id);
          if (!result) continue;
          this.deps.translations.put(task.jobId, segment.id, result);
          if (result.status === "done") {
            context.push({ source: segment.sourceText, target: result.text });
          }
          this.deps.events.publish({
            type: "segment.done",
            jobId: task.jobId,
            chapterId: task.chapterId,
            segmentId: segment.id,
            status: result.status,
          });
        }
        this.publishChapter(task.jobId, parsed, task.chapterId);
      }
    } catch (err) {
      if (task.controller.signal.aborted) return;
      const message =
        err instanceof FatalProviderError || err instanceof Error ? err.message : String(err);
      this.errors.set(key(task.jobId, task.chapterId), message);
    }
  }

  private initialContext(
    segments: readonly ParsedSegment[],
    existing: ReadonlyMap<string, { text: string; status: string }>,
  ): { source: string; target: string }[] {
    const context: { source: string; target: string }[] = [];
    for (const s of segments) {
      const t = existing.get(s.id);
      if (t?.status === "done") context.push({ source: s.sourceText, target: t.text });
    }
    return context;
  }

  private promptExtras(
    customPrompt: string,
    glossary: GlossaryEntry[],
  ): { instructions?: string; glossary?: GlossaryEntry[] } {
    const extras: { instructions?: string; glossary?: GlossaryEntry[] } = {};
    if (customPrompt.trim()) extras.instructions = customPrompt;
    if (glossary.length > 0) extras.glossary = glossary;
    return extras;
  }

  private publishChapter(jobId: string, parsed: ParsedBook, chapterId: string): void {
    const k = key(jobId, chapterId);
    this.deps.events.publish({
      type: "chapter.progress",
      jobId,
      progress: chapterProgress(
        parsed,
        chapterId,
        this.deps.translations.forJob(jobId),
        this.runtime.get(k),
        this.errors.get(k) ?? null,
      ),
    });
  }

  private publishJob(jobId: string): void {
    this.deps.events.publish({ type: "job.status", job: this.summary(jobId) });
  }
}
