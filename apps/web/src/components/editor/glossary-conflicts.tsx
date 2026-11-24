import type { GlossaryConflict, GlossaryRendering } from "@et/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface GlossaryConflictsProps {
  conflicts: GlossaryConflict[];
  volumeLabel: (rendering: GlossaryRendering) => string;
  onResolve: (source: string, target: string) => Promise<unknown>;
}

export function GlossaryConflictList({
  conflicts,
  volumeLabel,
  onResolve,
}: GlossaryConflictsProps) {
  const [pending, setPending] = useState<string | null>(null);

  const pick = async (source: string, target: string) => {
    setPending(source);
    try {
      await onResolve(source, target);
    } finally {
      setPending(null);
    }
  };

  return (
    <ul aria-label="Glossary conflicts" className="flex flex-col gap-4">
      {conflicts.map((conflict) => (
        <li key={conflict.source} className="flex flex-col gap-2">
          <span className="text-sm font-medium">{conflict.source}</span>
          <div className="flex flex-wrap gap-2">
            {[conflict.inForce, ...conflict.alternatives].map((rendering) => {
              const inForce = rendering === conflict.inForce;
              return (
                <Button
                  key={rendering.target}
                  variant={inForce ? "secondary" : "outline"}
                  size="sm"
                  className="h-auto flex-col items-start gap-0.5 py-1.5 text-left"
                  disabled={pending !== null}
                  onClick={() => pick(conflict.source, rendering.target)}
                >
                  <span>{rendering.target}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {volumeLabel(rendering)}
                    {inForce ? " · in force" : ""}
                  </span>
                  {rendering.note ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {rendering.note}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
