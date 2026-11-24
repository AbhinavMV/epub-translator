import type { ChapterProgress, ChapterStatus, JobSummary } from "@et/contracts";

export function progressFor(
  job: JobSummary | undefined,
  chapterId: string,
): ChapterProgress | undefined {
  return job?.progress.find((p) => p.chapterId === chapterId);
}

export function isBusy(status: ChapterStatus | undefined): boolean {
  return status === "running" || status === "queued" || status === "submitted";
}

export function translatedChapterCount(job: JobSummary | undefined): number {
  return job?.progress.filter((p) => p.status === "done").length ?? 0;
}

export function hasAnyTranslation(job: JobSummary | undefined): boolean {
  return job?.progress.some((p) => p.done > 0) ?? false;
}

export const STATUS_LABEL: Record<ChapterStatus, string> = {
  idle: "Not translated",
  queued: "Queued",
  running: "Translating",
  submitted: "Submitted · waiting for batch",
  done: "Translated",
  partial: "Partly translated",
  failed: "Failed",
};

export const STATUS_DOT: Record<ChapterStatus, string> = {
  idle: "bg-transparent ring-1 ring-inset ring-muted-foreground/50",
  queued: "bg-flag/70",
  running: "bg-primary animate-pulse",
  submitted: "bg-primary/50 animate-pulse",
  done: "bg-emerald-600 dark:bg-emerald-400",
  partial: "bg-flag",
  failed: "bg-destructive",
};

export type ChapterState = "not-started" | "busy" | "partial" | "failed" | "done";

export interface ChapterStatusInfo {
  state: ChapterState;
  /** Done and flagged passages, capped at the total. */
  translated: number;
  failed: number;
  total: number;
  /** Share of passages translated, 0 to 1. */
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
    return { ...counts, state: "busy", label: STATUS_LABEL[progress.status], detail: passages };
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
