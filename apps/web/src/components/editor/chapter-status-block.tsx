import type { ChapterProgress } from "@et/contracts";
import { Loader2, Square } from "lucide-react";
import { ProgressBar } from "@/components/status-line";
import { BUSY_LABEL, chapterStatus } from "@/lib/chapter-status";
import { cn } from "@/lib/utils";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function chapterLine(progress: ChapterProgress | undefined, segmentCount: number) {
  const status = chapterStatus(progress, segmentCount);
  if (status.state === "busy") return status.label;
  if (status.state === "done") return "Chapter translated";
  if (status.failed > 0) return `${plural(status.failed, "passage")} failed`;
  if (progress?.error) return "Chapter stopped";
  if (status.state === "not-started") return "Not started";
  return "Partly translated";
}

function BusyPill({
  progress,
  busyElsewhere,
  onCancel,
  onCheckBatch,
}: {
  progress: ChapterProgress | undefined;
  busyElsewhere: number;
  onCancel: () => void;
  onCheckBatch?: (() => void) | undefined;
}) {
  const status = progress?.status;
  const text =
    status === "running"
      ? `Translating ${Math.min(progress?.total ?? 0, (progress?.done ?? 0) + (progress?.flagged ?? 0))}/${progress?.total ?? 0} passages…`
      : status === "submitted"
        ? BUSY_LABEL.submitted
        : status === "queued"
          ? "Queued…"
          : `Translating ${plural(busyElsewhere, "other chapter")}…`;
  return (
    <span
      role="status"
      className="inline-flex max-w-full items-center gap-2 self-start rounded-full bg-primary/10 py-1 pr-1 pl-2.5 text-xs font-medium text-foreground"
    >
      <Loader2 className="size-3 shrink-0 animate-spin" />
      <span className="min-w-0">{text}</span>
      {onCheckBatch && status === "submitted" ? (
        <button
          type="button"
          onClick={onCheckBatch}
          className="shrink-0 rounded-full px-2 py-0.5 text-xs hover:bg-primary/15"
        >
          Check batch
        </button>
      ) : null}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel translation"
        title="Stop translating and clear the queue"
        className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-primary/15 coarse:size-11"
      >
        <Square className="size-2.5 fill-current" />
      </button>
    </span>
  );
}

export function ChapterStatusBlock({
  title,
  progress,
  segmentCount,
  chaptersDone,
  totalChapters,
  busyElsewhere,
  onCancel,
  onCheckBatch,
  className,
}: {
  title: string | undefined;
  progress: ChapterProgress | undefined;
  segmentCount: number;
  chaptersDone: number;
  totalChapters: number;
  busyElsewhere: number;
  onCancel: () => void;
  onCheckBatch?: (() => void) | undefined;
  className?: string;
}) {
  const status = chapterStatus(progress, segmentCount);
  const busy = status.state === "busy";
  return (
    <div
      className={cn("flex flex-wrap items-end gap-x-6 gap-y-3 px-3 pt-5 pb-3 sm:px-5", className)}
    >
      <h2 className="min-w-0 flex-[1_1_16rem] font-serif text-xl leading-snug font-medium break-words text-balance sm:text-2xl">
        {title}
      </h2>
      <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-1.5 sm:max-w-xs">
        {(busy || busyElsewhere > 0) && (
          <BusyPill
            progress={busy ? progress : undefined}
            busyElsewhere={busyElsewhere}
            onCancel={onCancel}
            onCheckBatch={onCheckBatch}
          />
        )}
        <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
          <span className={cn(status.state === "done" && "font-medium text-ok")}>
            {chapterLine(progress, segmentCount)}
          </span>
          <span>
            {status.translated} of {status.total} passages
          </span>
        </div>
        <ProgressBar
          ratio={status.ratio}
          done={status.state === "done"}
          label="Passages translated"
        />
        <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground tabular-nums">
          <span>This volume</span>
          <span>
            {chaptersDone} of {totalChapters} chapters
          </span>
        </div>
      </div>
    </div>
  );
}
