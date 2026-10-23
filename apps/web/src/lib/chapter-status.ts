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
