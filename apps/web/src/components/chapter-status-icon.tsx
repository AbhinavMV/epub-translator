import type { ChapterStatusInfo } from "@/lib/chapter-status";
import { cn } from "@/lib/utils";

const R = 6.2;

function arc(ratio: number): string {
  const a = Math.min(ratio, 0.999) * 2 * Math.PI;
  const x = 8 + R * Math.sin(a);
  const y = 8 - R * Math.cos(a);
  return `M8 ${8 - R} A${R} ${R} 0 ${ratio > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** A ring that fills with the share translated: green tick when done, red dot when passages failed. */
export function ChapterStatusIcon({
  status,
  className,
}: {
  status: ChapterStatusInfo;
  className?: string;
}) {
  const { state, ratio } = status;
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label={status.label}
      className={cn("size-4 shrink-0", state === "busy" && "animate-pulse", className)}
    >
      <title>{status.label}</title>
      {state === "done" ? (
        <>
          <circle cx="8" cy="8" r="7" className="fill-ok" />
          <path
            d="m5 8.2 2 2 4-4.2"
            className="stroke-background"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r={R} fill="none" className="stroke-border" strokeWidth="1.6" />
          {ratio > 0 && (
            <path
              d={arc(ratio)}
              fill="none"
              strokeWidth="1.6"
              className={state === "failed" ? "stroke-destructive" : "stroke-primary"}
            />
          )}
          {state === "failed" && <circle cx="8" cy="8" r="2" className="fill-destructive" />}
        </>
      )}
    </svg>
  );
}
