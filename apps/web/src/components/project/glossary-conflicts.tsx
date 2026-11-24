import type { GlossaryConflict, GlossaryRendering } from "@et/contracts";
import { AlertTriangle } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const OPTION =
  "flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-colors outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring coarse:min-h-11";

const FAKE_BUTTON =
  "inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-sm font-medium";

export function GlossaryConflictBox({
  conflicts,
  volumeLabel,
  onUse,
  onWriteOwn,
}: {
  conflicts: readonly GlossaryConflict[];
  volumeLabel: (rendering: GlossaryRendering) => string;
  onUse: (source: string, rendering: GlossaryRendering) => void;
  onWriteOwn: (source: string) => void;
}) {
  const headingId = useId();
  if (conflicts.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-flag/40 bg-flag/10 p-4"
    >
      <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle aria-hidden className="size-4 shrink-0 text-flag" />
        {plural(conflicts.length, "glossary conflict", "glossary conflicts")} to settle
      </h2>
      <ul aria-label="Glossary conflicts" className="flex min-w-0 flex-col gap-4">
        {conflicts.map((conflict) => (
          <li key={conflict.source} className="flex min-w-0 flex-col gap-3">
            <p className="text-sm break-words">
              Your volumes used different renderings for{" "}
              <b className="font-semibold">{conflict.source}</b>. Translations use{" "}
              <b className="font-semibold">“{conflict.inForce.target}”</b> until you pick one.
              Choose the rendering every volume should use from now on.
            </p>
            <div className="grid min-w-0 gap-2">
              {[conflict.inForce, ...conflict.alternatives].map((rendering) => {
                const inForce = rendering === conflict.inForce;
                return (
                  <button
                    key={rendering.target}
                    type="button"
                    className={OPTION}
                    onClick={() => onUse(conflict.source, rendering)}
                  >
                    <span className="flex min-w-0 flex-col">
                      <b className="font-semibold break-words">“{rendering.target}”</b>
                      <span className="text-xs break-words text-muted-foreground">
                        Used in {volumeLabel(rendering)}
                        {inForce ? " · in force now" : ""}
                        {rendering.note ? ` · ${rendering.note}` : ""}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        FAKE_BUTTON,
                        inForce
                          ? "bg-background"
                          : "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      Use this
                    </span>
                  </button>
                );
              })}
              <button type="button" className={OPTION} onClick={() => onWriteOwn(conflict.source)}>
                <span className="flex min-w-0 flex-col">
                  <b className="font-semibold">Write a different rendering</b>
                  <span className="text-xs text-muted-foreground">
                    Edit the entry in the table below
                  </span>
                </span>
                <span aria-hidden className={cn(FAKE_BUTTON, "bg-background")}>
                  Edit
                </span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Settling a conflict doesn’t retranslate earlier chapters. Use Proofread on those volumes to
        catch the old rendering.
      </p>
    </section>
  );
}
