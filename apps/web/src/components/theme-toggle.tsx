import { Moon, Sun, SunDim } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ThemeName, usePrefs } from "@/lib/reader-settings-store";

export function ThemeToggle() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={prefs.theme}
      onValueChange={(v) => v && setPrefs({ theme: v as ThemeName })}
      aria-label="Theme"
    >
      <ToggleGroupItem value="light" aria-label="Light theme">
        <Sun />
      </ToggleGroupItem>
      <ToggleGroupItem value="sepia" aria-label="Sepia theme">
        <SunDim />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark theme">
        <Moon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
