import { Check } from "lucide-react";
import type { ProgressStatus } from "@/lib/progress-status";
import { cn } from "@/lib/utils";

export function ProgressBar({
  ratio,
  done = false,
  label,
  className,
}: {
  ratio: number;
  done?: boolean;
  label: string;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      <div
        className={cn("h-full rounded-full", done ? "bg-ok" : "bg-primary")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function StatusLine({
  status,
  bar = true,
  className,
}: {
  status: ProgressStatus;
  bar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span
        className={cn(
          "flex min-w-0 items-start gap-1.5 text-xs leading-[18px] tabular-nums",
          status.done ? "font-medium text-ok" : "text-muted-foreground",
        )}
      >
        {status.done && <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
        <span className="min-w-0 break-words">{status.text}</span>
      </span>
      {bar && <ProgressBar ratio={status.ratio} done={status.done} label={status.text} />}
    </div>
  );
}
