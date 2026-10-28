import type { ChapterProgress, Usage } from "@et/contracts";
import { InvalidWorkResultError, LeaseError } from "../../domain/errors.ts";
import type { SegmentTranslation } from "../../domain/segment.ts";
import type { JobEventSink } from "../../ports/events.ts";
import type { Repositories } from "../../ports/stores.ts";
import type { WorkLeaseRepository } from "../../ports/work-lease.ts";
import { chapterProgress } from "../job-progress.ts";
import { loadChapterJob } from "./plan-work-unit.ts";
import { recordResults } from "./record-results.ts";
import { vetClientResults } from "./vet-results.ts";

export interface ApplyWorkResultInput {
  jobId: string;
  leaseId: string;
  results: ReadonlyMap<string, SegmentTranslation>;
  usage: Usage;
  events?: JobEventSink;
}

export async function chapterProgressOf(
  repos: Repositories,
  jobId: string,
  chapterId: string,
): Promise<ChapterProgress> {
  const { parsed } = await loadChapterJob(repos, jobId, chapterId);
  const open = await repos.batches.openForChapter(jobId, chapterId);
  return chapterProgress(
    parsed,
    chapterId,
    await repos.translations.forJob(jobId),
    open ? { status: "submitted" } : undefined,
    null,
  );
}

export async function applyWorkResult(
  repos: Repositories,
  leases: WorkLeaseRepository,
  input: ApplyWorkResultInput,
): Promise<ChapterProgress> {
  const lease = await leases.get(input.leaseId);
  if (!lease || lease.jobId !== input.jobId) throw new LeaseError("Lease expired or unknown");

  const { parsed } = await loadChapterJob(repos, input.jobId, lease.chapterId);
  const leased = new Set(lease.segmentIds);
  const foreign = [...input.results.keys()].filter((id) => !leased.has(id));
  if (foreign.length > 0) {
    throw new InvalidWorkResultError(`Segments are not part of this lease: ${foreign.join(", ")}`);
  }

  const sources = new Map(parsed.segments.map((s) => [s.id, s]));
  const vetted = vetClientResults(sources, input.results);
  const { inputTokens, outputTokens } = input.usage;
  await recordResults(repos, input.events, {
    jobId: input.jobId,
    chapterId: lease.chapterId,
    usage: { inputTokens: Math.max(0, inputTokens), outputTokens: Math.max(0, outputTokens) },
    entries: [...vetted],
  });
  await leases.release(input.leaseId);
  const progress = await chapterProgressOf(repos, input.jobId, lease.chapterId);
  input.events?.publish({ type: "chapter.progress", jobId: input.jobId, progress });
  return progress;
}
