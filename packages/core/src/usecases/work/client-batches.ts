import type { ChapterProgress, ProviderId, Usage } from "@et/contracts";
import type { ProviderBatch } from "../../domain/batch.ts";
import { ConflictError, InvalidWorkResultError, NotFoundError } from "../../domain/errors.ts";
import type { SegmentTranslation } from "../../domain/segment.ts";
import type { JobEventSink } from "../../ports/events.ts";
import type { Repositories } from "../../ports/stores.ts";
import type { Clock, IdGenerator } from "../../ports/system.ts";
import { batchSegments } from "../../translation/batcher.ts";
import { chapterWork } from "../chapter-work.ts";
import { chapterProgressOf } from "./apply-work-result.ts";
import { loadChapterJob, type WorkLimits, type WorkUnit } from "./plan-work-unit.ts";
import { recordResults } from "./record-results.ts";
import { segmentRequest } from "./request.ts";
import { vetClientResults } from "./vet-results.ts";

export type BatchUnit = Omit<WorkUnit, "leaseId" | "jobId" | "chapterId" | "model"> & {
  customId: string;
};

export async function planBatchUnits(
  repos: Repositories,
  input: { jobId: string; chapterId: string } & WorkLimits,
): Promise<BatchUnit[]> {
  const { job, parsed } = await loadChapterJob(repos, input.jobId, input.chapterId);
  if (await repos.batches.openForChapter(job.id, input.chapterId)) return [];
  const settings = await repos.settings.get(job.bookId);
  const segments = parsed.segments.filter((s) => s.chapterId === input.chapterId);
  const { pending, context } = chapterWork(
    segments,
    await repos.translations.forSegments(
      job.id,
      segments.map((s) => s.id),
    ),
  );
  return batchSegments(pending, input.maxChars, input.maxCount).map((split, i) => {
    const { model: _model, ...request } = segmentRequest(
      { job, parsed, settings, contextSize: input.contextSize },
      "",
      split,
      context,
    );
    return { customId: String(i), ...request };
  });
}

export interface RecordBatchInput {
  jobId: string;
  chapterId: string;
  provider: ProviderId;
  model: string;
  vendorBatchId: string;
  segmentIds: string[][];
}

export async function recordClientBatch(
  repos: Repositories,
  deps: { ids: IdGenerator; clock: Clock; events?: JobEventSink },
  input: RecordBatchInput,
): Promise<ProviderBatch> {
  const { parsed } = await loadChapterJob(repos, input.jobId, input.chapterId);
  const inChapter = new Set(
    parsed.segments.filter((s) => s.chapterId === input.chapterId).map((s) => s.id),
  );
  const foreign = input.segmentIds.flat().filter((id) => !inChapter.has(id));
  if (foreign.length > 0) {
    throw new InvalidWorkResultError(
      `Segments are not part of this chapter: ${foreign.join(", ")}`,
    );
  }
  if (await repos.batches.openForChapter(input.jobId, input.chapterId)) {
    throw new ConflictError("This chapter already has a batch in flight");
  }
  const batch: ProviderBatch = {
    id: deps.ids.next(),
    jobId: input.jobId,
    chapterId: input.chapterId,
    provider: input.provider,
    model: input.model,
    vendorBatchId: input.vendorBatchId,
    status: "submitted",
    segmentIds: input.segmentIds,
    createdAt: deps.clock.now().toISOString(),
  };
  await repos.batches.insert(batch);
  deps.events?.publish({
    type: "chapter.progress",
    jobId: input.jobId,
    progress: await chapterProgressOf(repos, input.jobId, input.chapterId),
  });
  return batch;
}

async function openBatch(repos: Repositories, jobId: string, batchId: string) {
  const batch = (await repos.batches.openForJob(jobId)).find((b) => b.id === batchId);
  if (!batch) throw new NotFoundError("Open batch", batchId);
  return batch;
}

export async function applyBatchResult(
  repos: Repositories,
  input: {
    jobId: string;
    batchId: string;
    results: ReadonlyMap<string, SegmentTranslation>;
    usage: Usage;
    events?: JobEventSink;
  },
): Promise<ChapterProgress> {
  const batch = await openBatch(repos, input.jobId, input.batchId);
  const { parsed } = await loadChapterJob(repos, input.jobId, batch.chapterId);
  const owned = new Set(batch.segmentIds.flat());
  const foreign = [...input.results.keys()].filter((id) => !owned.has(id));
  if (foreign.length > 0) {
    throw new InvalidWorkResultError(`Segments are not part of this batch: ${foreign.join(", ")}`);
  }
  const sources = new Map(parsed.segments.map((s) => [s.id, s]));
  await recordResults(repos, input.events, {
    jobId: input.jobId,
    chapterId: batch.chapterId,
    usage: {
      inputTokens: Math.max(0, input.usage.inputTokens),
      outputTokens: Math.max(0, input.usage.outputTokens),
    },
    entries: [...vetClientResults(sources, input.results)],
  });
  await repos.batches.setStatus(batch.id, "ended");
  const progress = await chapterProgressOf(repos, input.jobId, batch.chapterId);
  input.events?.publish({ type: "chapter.progress", jobId: input.jobId, progress });
  return progress;
}

export async function endClientBatch(
  repos: Repositories,
  input: {
    jobId: string;
    batchId: string;
    status: "failed" | "cancelled";
    error?: string;
    events?: JobEventSink;
  },
): Promise<ChapterProgress> {
  const batch = await openBatch(repos, input.jobId, input.batchId);
  await repos.batches.setStatus(batch.id, input.status);
  if (input.status === "failed" && input.error) {
    await repos.jobs.update(input.jobId, { error: input.error.slice(0, 500) });
  }
  const progress = await chapterProgressOf(repos, input.jobId, batch.chapterId);
  input.events?.publish({ type: "chapter.progress", jobId: input.jobId, progress });
  return progress;
}
