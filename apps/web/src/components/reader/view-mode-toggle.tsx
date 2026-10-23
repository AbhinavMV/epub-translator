import { Columns2, Rows3, Type } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ViewMode } from "@/lib/reader-settings-store";

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as ViewMode)}
      aria-label="View mode"
    >
      <ToggleGroupItem value="translation" aria-label="Translation">
        <Type />
        <span className="hidden lg:inline">Translation</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="interleaved" aria-label="Interleaved">
        <Rows3 />
        <span className="hidden lg:inline">Interleaved</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="side-by-side" aria-label="Side-by-side">
        <Columns2 />
        <span className="hidden lg:inline">Side-by-side</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
