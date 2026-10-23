import type {
  ChapterProgress,
  ChapterStatus,
  JobStatus,
  JobSummary,
  JobTitles,
} from "@et/contracts";
import type { ParsedBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { SegmentTranslation } from "../domain/segment.ts";

export interface ChapterRuntime {
  status: "queued" | "running" | "submitted";
}

export function chapterProgress(
  book: ParsedBook,
  chapterId: string,
  translations: ReadonlyMap<string, SegmentTranslation>,
  runtime: ChapterRuntime | undefined,
  error: string | null,
): ChapterProgress {
  let total = 0;
  let done = 0;
  let flagged = 0;
  let failed = 0;
  for (const segment of book.segments) {
    if (segment.chapterId !== chapterId) continue;
    total++;
    const t = translations.get(segment.id);
    if (t?.status === "done") done++;
    else if (t?.status === "flagged") flagged++;
    else if (t?.status === "failed") failed++;
  }
  return {
    chapterId,
    status: chapterStatus(runtime, error, { total, done, flagged, failed }),
    done,
    flagged,
    failed,
    total,
    error,
  };
}

function chapterStatus(
  runtime: ChapterRuntime | undefined,
  error: string | null,
  c: { total: number; done: number; flagged: number; failed: number },
): ChapterStatus {
  if (runtime) return runtime.status;
  if (error) return "failed";
  const translated = c.done + c.flagged;
  if (translated === c.total && c.failed === 0) return "done";
  if (translated + c.failed === 0) return "idle";
  return "partial";
}

export function jobStatus(progress: readonly ChapterProgress[]): JobStatus {
  const inFlight = ["queued", "running", "submitted"];
  if (progress.some((p) => inFlight.includes(p.status))) return "running";
  if (progress.some((p) => p.status === "failed")) return "failed";
  if (progress.every((p) => p.status === "done")) return "done";
  return "idle";
}

export function jobSummary(
  job: Job,
  progress: ChapterProgress[],
  titles: JobTitles,
): JobSummary {
  return {
    id: job.id,
    bookId: job.bookId,
    targetLang: job.targetLang,
    status: jobStatus(progress),
    error: job.error,
    progress,
    titles,
    usage: job.usage,
    createdAt: job.createdAt,
  };
}
