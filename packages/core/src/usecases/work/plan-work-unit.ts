import type { GlossaryEntry, TargetLanguage } from "@et/contracts";
import type { ParsedBook, ParsedChapter } from "../../domain/book.ts";
import { NotFoundError } from "../../domain/errors.ts";
import type { Job } from "../../domain/job.ts";
import type { Repositories } from "../../ports/stores.ts";
import type { WorkLeaseRepository } from "../../ports/work-lease.ts";
import { batchSegments } from "../../translation/batcher.ts";
import { chapterWork } from "../chapter-work.ts";
import { requireBook } from "../load-book.ts";
import { segmentRequest } from "./request.ts";

export const LEASE_TTL_MS = 10 * 60 * 1000;

export interface WorkLimits {
  maxChars: number;
  maxCount: number;
  contextSize: number;
}

export interface WorkUnit {
  leaseId: string;
  jobId: string;
  chapterId: string;
  model?: string;
  sourceLang: string | null;
  target: TargetLanguage;
  bookTitle: string;
  context: { source: string; target: string }[];
  segments: { id: string; text: string }[];
  instructions?: string;
  glossary?: GlossaryEntry[];
}

export async function loadChapterJob(
  repos: Repositories,
  jobId: string,
  chapterId: string,
): Promise<{ job: Job; parsed: ParsedBook; chapter: ParsedChapter }> {
  const job = await repos.jobs.get(jobId);
  if (!job) throw new NotFoundError("Job", jobId);
  const { parsed } = await requireBook(repos.books, job.bookId);
  const chapter = parsed.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new NotFoundError("Chapter", chapterId);
  return { job, parsed, chapter };
}

export async function planWorkUnit(
  repos: Repositories,
  leases: WorkLeaseRepository,
  input: { jobId: string; chapterId: string } & WorkLimits,
): Promise<WorkUnit | null> {
  const { job, parsed } = await loadChapterJob(repos, input.jobId, input.chapterId);
  const settings = await repos.settings.get(job.bookId);
  const segments = parsed.segments.filter((s) => s.chapterId === input.chapterId);
  const { pending, context } = chapterWork(segments, await repos.translations.forJob(job.id));

  for (const batch of batchSegments(pending, input.maxChars, input.maxCount)) {
    const claimed = await leases.lease(
      job.id,
      input.chapterId,
      batch.map((s) => s.id),
      LEASE_TTL_MS,
    );
    if (!claimed) continue;
    const mine = new Set(claimed.segmentIds);
    const { model: _model, ...request } = segmentRequest(
      { job, parsed, settings, contextSize: input.contextSize },
      settings.model ?? "",
      batch.filter((s) => mine.has(s.id)),
      context,
    );
    return {
      leaseId: claimed.leaseId,
      jobId: job.id,
      chapterId: input.chapterId,
      ...(settings.model ? { model: settings.model } : {}),
      ...request,
    };
  }
  return null;
}
