import { getTargetLanguage, type TranslateBody } from "@et/contracts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { BatchRequest, BatchTranslationProvider } from "../ports/batch-provider.ts";
import type { BatchRepository } from "../ports/batch-repository.ts";
import type { JobEventSink } from "../ports/events.ts";
import type {
  BookRepository,
  BookSettingsRepository,
  JobRepository,
  TranslationRepository,
} from "../ports/stores.ts";
import type { Clock, IdGenerator } from "../ports/system.ts";
import type { SegmentBatchResult } from "../ports/translation-provider.ts";
import { batchSegments } from "../translation/batcher.ts";
import { settleOnce } from "../translation/settle.ts";
import { chapterWork, promptExtras } from "./chapter-work.ts";

export interface BatchDeps {
  repo: BatchRepository;
  provider: (id: TranslateBody["provider"]) => BatchTranslationProvider | null;
  ids: IdGenerator;
  clock: Clock;
}

export interface BatchRunnerDeps {
  books: BookRepository;
  jobs: JobRepository;
  translations: TranslationRepository;
  settings: BookSettingsRepository;
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
  constructor(
    private readonly deps: BatchRunnerDeps,
    private readonly options: BatchRunnerOptions,
  ) {}

  supports(id: TranslateBody["provider"]): boolean {
    return this.deps.batch.provider(id) !== null;
  }

  hasOpen(jobId: string, chapterId: string): boolean {
    return this.deps.batch.repo.openForChapter(jobId, chapterId) !== null;
  }

  async submit(
    jobId: string,
    chapterId: string,
    body: TranslateBody,
    isCancelled: () => boolean,
  ): Promise<void> {
    const provider = this.deps.batch.provider(body.provider);
    const job = this.deps.jobs.get(jobId);
    const parsed = job ? this.deps.books.getParsed(job.bookId) : null;
    if (!provider || !job || !parsed) return;

    const settings = this.deps.settings.get(job.bookId);
    const segments = parsed.segments.filter((s) => s.chapterId === chapterId);
    const { pending, context } = chapterWork(segments, this.deps.translations.forJob(jobId));
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
    this.deps.batch.repo.insert({
      id: this.deps.batch.ids.next(),
      jobId,
      chapterId,
      provider: body.provider,
      model: body.model,
      vendorBatchId,
      status: "submitted",
      segmentIds: splits.map((split) => split.map((s) => s.id)),
      createdAt: this.deps.batch.clock.now().toISOString(),
    });
  }

  async poll(): Promise<ChapterTouched[]> {
    const touched: ChapterTouched[] = [];
    for (const batch of this.deps.batch.repo.listOpen()) {
      const provider = this.deps.batch.provider(batch.provider);
      if (!provider) continue;
      let fetched: Awaited<ReturnType<BatchTranslationProvider["fetch"]>>;
      try {
        fetched = await provider.fetch(batch.vendorBatchId);
      } catch {
        continue;
      }
      const stillOpen = this.deps.batch.repo.openForChapter(batch.jobId, batch.chapterId);
      if (stillOpen?.id !== batch.id || fetched.status === "in_progress") continue;

      if (fetched.status === "failed") {
        this.deps.batch.repo.setStatus(batch.id, "failed");
        touched.push({ jobId: batch.jobId, chapterId: batch.chapterId, error: fetched.cause });
        continue;
      }
      this.apply(batch.jobId, batch.chapterId, batch.segmentIds, fetched.results);
      this.deps.batch.repo.setStatus(batch.id, "ended");
      touched.push({ jobId: batch.jobId, chapterId: batch.chapterId, error: null });
    }
    return touched;
  }

  cancelChapter(jobId: string, chapterId: string): void {
    const open = this.deps.batch.repo.openForChapter(jobId, chapterId);
    if (open) this.cancel(open.id, open.provider, open.vendorBatchId);
  }

  cancelJob(jobId: string): void {
    for (const open of this.deps.batch.repo.openForJob(jobId)) {
      this.cancel(open.id, open.provider, open.vendorBatchId);
    }
  }

  private cancel(id: string, providerId: TranslateBody["provider"], vendorBatchId: string): void {
    this.deps.batch.repo.setStatus(id, "cancelled");
    void this.deps.batch
      .provider(providerId)
      ?.cancel(vendorBatchId)
      .catch(() => {});
  }

  private apply(
    jobId: string,
    chapterId: string,
    segmentIds: readonly (readonly string[])[],
    results: ReadonlyMap<string, SegmentBatchResult>,
  ): void {
    const job = this.deps.jobs.get(jobId);
    const parsed = job ? this.deps.books.getParsed(job.bookId) : null;
    if (!parsed) return;
    const sources = new Map(parsed.segments.map((s) => [s.id, s]));

    segmentIds.forEach((ids, index) => {
      const split = ids.flatMap((id) => {
        const s = sources.get(id);
        return s ? [{ id, text: s.sourceText }] : [];
      });
      const result = results.get(String(index)) ?? {
        kind: "fatal" as const,
        cause: "missing from batch output",
      };
      const settled = settleOnce(split, result);
      this.deps.jobs.addUsage(jobId, settled.usage);
      for (const [segmentId, translation] of settled.results) {
        this.record(jobId, chapterId, segmentId, translation);
      }
    });
  }

  private record(
    jobId: string,
    chapterId: string,
    segmentId: string,
    translation: SegmentTranslation,
  ): void {
    this.deps.translations.put(jobId, segmentId, translation);
    this.deps.events.publish({
      type: "segment.done",
      jobId,
      chapterId,
      segmentId,
      status: translation.status,
    });
  }
}
