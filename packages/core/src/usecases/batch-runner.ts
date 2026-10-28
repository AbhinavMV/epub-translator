import { getTargetLanguage, type TranslateBody } from "@et/contracts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { BatchRequest, BatchTranslationProvider } from "../ports/batch-provider.ts";
import type { JobEventSink } from "../ports/events.ts";
import type { Repositories } from "../ports/stores.ts";
import type { Clock, IdGenerator } from "../ports/system.ts";
import type { SegmentBatchResult } from "../ports/translation-provider.ts";
import { batchSegments } from "../translation/batcher.ts";
import { settleOnce } from "../translation/settle.ts";
import { chapterWork, promptExtras } from "./chapter-work.ts";

export interface BatchDeps {
  provider: (id: TranslateBody["provider"]) => BatchTranslationProvider | null;
  ids: IdGenerator;
  clock: Clock;
}

export interface BatchRunnerDeps {
  events: JobEventSink;
  batch: BatchDeps;
}

export interface BatchRunnerOptions {
  contextSize: number;
  maxChars: number;
  maxCount: number;
}

export interface ChapterTouched {
  jobId: string;
  chapterId: string;
  error: string | null;
}

export class BatchRunner {
  private readonly cancelEpoch = new Map<string, number>();

  constructor(
    private readonly deps: BatchRunnerDeps,
    private readonly options: BatchRunnerOptions,
  ) {}

  supports(id: TranslateBody["provider"]): boolean {
    return this.deps.batch.provider(id) !== null;
  }

  async hasOpen(repos: Repositories, jobId: string, chapterId: string): Promise<boolean> {
    return (await repos.batches.openForChapter(jobId, chapterId)) !== null;
  }

  async submit(
    repos: Repositories,
    jobId: string,
    chapterId: string,
    body: TranslateBody,
    isCancelled: () => boolean,
  ): Promise<void> {
    const provider = this.deps.batch.provider(body.provider);
    const job = await repos.jobs.get(jobId);
    const parsed = job ? await repos.books.getParsed(job.bookId) : null;
    if (!provider || !job || !parsed) return;

    const settings = await repos.settings.get(job.bookId);
    const segments = parsed.segments.filter((s) => s.chapterId === chapterId);
    const { pending, context } = chapterWork(segments, await repos.translations.forJob(jobId));
    const splits = batchSegments(pending, this.options.maxChars, this.options.maxCount);
    if (splits.length === 0) return;

    const requests: BatchRequest[] = splits.map((split, i) => ({
      customId: String(i),
      request: {
        model: body.model,
        sourceLang: job.sourceLang,
        target: getTargetLanguage(job.targetLang),
        bookTitle: parsed.title,
        context: context.slice(-this.options.contextSize),
        segments: split.map((s) => ({ id: s.id, text: s.sourceText })),
        ...promptExtras(settings.customPrompt, settings.glossary),
      },
    }));

    const vendorBatchId = await provider.submit(requests);
    if (isCancelled()) {
      await provider.cancel(vendorBatchId).catch(() => {});
      return;
    }
    const id = this.deps.batch.ids.next();
    await repos.batches.insert({
      id,
      jobId,
      chapterId,
      provider: body.provider,
      model: body.model,
      vendorBatchId,
      status: "submitted",
      segmentIds: splits.map((split) => split.map((s) => s.id)),
      createdAt: this.deps.batch.clock.now().toISOString(),
    });
    // A cancel that lands while the insert is in flight cannot see the row yet.
    if (isCancelled()) await this.cancel(repos, id, body.provider, vendorBatchId);
  }

  async poll(repos: Repositories): Promise<ChapterTouched[]> {
    const touched: ChapterTouched[] = [];
    for (const batch of await repos.batches.listOpen()) {
      const provider = this.deps.batch.provider(batch.provider);
      if (!provider) continue;
      const epoch = this.epochOf(batch.jobId);
      let fetched: Awaited<ReturnType<BatchTranslationProvider["fetch"]>>;
      try {
        fetched = await provider.fetch(batch.vendorBatchId);
      } catch {
        continue;
      }
      if (this.epochOf(batch.jobId) !== epoch) continue;
      const stillOpen = await repos.batches.openForChapter(batch.jobId, batch.chapterId);
      if (stillOpen?.id !== batch.id || fetched.status === "in_progress") continue;
      if (this.epochOf(batch.jobId) !== epoch) continue;

      if (fetched.status === "failed") {
        await repos.batches.setStatus(batch.id, "failed");
        touched.push({ jobId: batch.jobId, chapterId: batch.chapterId, error: fetched.cause });
        continue;
      }
      const applied = await this.apply(
        repos,
        batch.jobId,
        batch.chapterId,
        batch.segmentIds,
        fetched.results,
        epoch,
      );
      if (!applied) continue;
      await repos.batches.setStatus(batch.id, "ended");
      touched.push({ jobId: batch.jobId, chapterId: batch.chapterId, error: null });
    }
    return touched;
  }

  async cancelChapter(repos: Repositories, jobId: string, chapterId: string): Promise<void> {
    this.bumpEpoch(jobId);
    const open = await repos.batches.openForChapter(jobId, chapterId);
    if (open) await this.cancel(repos, open.id, open.provider, open.vendorBatchId);
  }

  async cancelJob(repos: Repositories, jobId: string): Promise<void> {
    this.bumpEpoch(jobId);
    for (const open of await repos.batches.openForJob(jobId)) {
      await this.cancel(repos, open.id, open.provider, open.vendorBatchId);
    }
  }

  // Cancels bump this synchronously so an in-flight poll can tell its fetch went stale
  // before the cancelled status reaches the store.
  private epochOf(jobId: string): number {
    return this.cancelEpoch.get(jobId) ?? 0;
  }

  private bumpEpoch(jobId: string): void {
    this.cancelEpoch.set(jobId, this.epochOf(jobId) + 1);
  }

  private async cancel(
    repos: Repositories,
    id: string,
    providerId: TranslateBody["provider"],
    vendorBatchId: string,
  ): Promise<void> {
    await repos.batches.setStatus(id, "cancelled");
    void this.deps.batch
      .provider(providerId)
      ?.cancel(vendorBatchId)
      .catch(() => {});
  }

  private async apply(
    repos: Repositories,
    jobId: string,
    chapterId: string,
    segmentIds: readonly (readonly string[])[],
    results: ReadonlyMap<string, SegmentBatchResult>,
    epoch: number,
  ): Promise<boolean> {
    const job = await repos.jobs.get(jobId);
    const parsed = job ? await repos.books.getParsed(job.bookId) : null;
    if (!parsed) return true;
    const sources = new Map(parsed.segments.map((s) => [s.id, s]));

    for (const [index, ids] of segmentIds.entries()) {
      const split = ids.flatMap((id) => {
        const s = sources.get(id);
        return s ? [{ id, text: s.sourceText }] : [];
      });
      const result = results.get(String(index)) ?? {
        kind: "fatal" as const,
        cause: "missing from batch output",
      };
      const settled = settleOnce(split, result);
      if (this.epochOf(jobId) !== epoch) return false;
      await repos.jobs.addUsage(jobId, settled.usage);
      for (const [segmentId, translation] of settled.results) {
        if (this.epochOf(jobId) !== epoch) return false;
        await this.record(repos, jobId, chapterId, segmentId, translation);
      }
    }
    return true;
  }

  private async record(
    repos: Repositories,
    jobId: string,
    chapterId: string,
    segmentId: string,
    translation: SegmentTranslation,
  ): Promise<void> {
    await repos.translations.put(jobId, segmentId, translation);
    this.deps.events.publish({
      type: "segment.done",
      jobId,
      chapterId,
      segmentId,
      status: translation.status,
    });
  }
}
