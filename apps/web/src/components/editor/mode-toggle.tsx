import type { TranslateMode } from "@et/contracts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ModeToggle({
  mode,
  batchAvailable,
  onChange,
}: {
  mode: TranslateMode;
  batchAvailable: boolean;
  onChange: (next: TranslateMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={(next) => {
        if (next === "live" || next === "batch") onChange(next);
      }}
      aria-label="Translation mode"
    >
      <ToggleGroupItem value="live" title="Translate now, billed at standard rates">
        Live
      </ToggleGroupItem>
      <ToggleGroupItem
        value="batch"
        disabled={!batchAvailable}
        title={
          batchAvailable
            ? "Half price; the vendor returns results within 24 hours"
            : "This provider has no batch API"
        }
      >
        Batch
        <span className="hidden font-mono text-[10px] text-muted-foreground lg:inline">−50%</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
