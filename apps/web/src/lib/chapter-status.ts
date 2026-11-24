import type { ChapterProgress, ChapterStatus, JobSummary } from "@et/contracts";

export function progressFor(
  job: JobSummary | undefined,
  chapterId: string,
): ChapterProgress | undefined {
  return job?.progress.find((p) => p.chapterId === chapterId);
}

type BusyStatus = Extract<ChapterStatus, "queued" | "running" | "submitted">;

export function isBusy(status: ChapterStatus | undefined): status is BusyStatus {
  return status === "running" || status === "queued" || status === "submitted";
}

export function translatedChapterCount(job: JobSummary | undefined): number {
  return job?.progress.filter((p) => p.status === "done").length ?? 0;
}

export function hasAnyTranslation(job: JobSummary | undefined): boolean {
  return job?.progress.some((p) => p.done > 0) ?? false;
}

export const BUSY_LABEL: Record<BusyStatus, string> = {
  queued: "Queued",
  running: "Translating",
  submitted: "Submitted · waiting for batch",
};

export type ChapterState = "not-started" | "busy" | "partial" | "failed" | "done";

export interface ChapterStatusInfo {
  state: ChapterState;
  /** Done and flagged passages, capped at the total. */
  translated: number;
  failed: number;
  total: number;
  ratio: number;
  label: string;
  detail: string;
}

/**
 * Derives the state from the passage counts rather than `progress.status`: a chapter with only
 * flagged passages left is translated, though the job may still call it partial.
 */
export function chapterStatus(
  progress: ChapterProgress | undefined,
  segmentCount: number,
): ChapterStatusInfo {
  const total = progress?.total ?? segmentCount;
  const translated = Math.min(total, (progress?.done ?? 0) + (progress?.flagged ?? 0));
  const failed = progress?.failed ?? 0;
  const ratio = total > 0 ? translated / total : 0;
  const counts = { translated, failed, total, ratio };
  const passages = `${translated}/${total} passages`;

  if (progress && isBusy(progress.status)) {
    return { ...counts, state: "busy", label: BUSY_LABEL[progress.status], detail: passages };
  }
  if (failed > 0) {
    return {
      ...counts,
      state: "failed",
      label: "Has failed passages",
      detail: `${translated}/${total} · ${failed} failed`,
    };
  }
  if (progress?.error) return { ...counts, state: "failed", label: "Failed", detail: passages };
  if (translated === total) {
    return { ...counts, state: "done", label: "Translated", detail: "Translated" };
  }
  if (translated === 0) {
    return { ...counts, state: "not-started", label: "Not started", detail: `${total} passages` };
  }
  return { ...counts, state: "partial", label: "Partly translated", detail: passages };
}
