import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type FontName,
  type ThemeName,
  usePrefs,
  type WidthName,
} from "@/lib/reader-settings-store";

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
        {value && <span className="font-mono text-xs">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function ReaderSettings() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Reader settings">
          <SlidersHorizontal />
          <span className="hidden sm:inline">Aa</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-5">
        <Field label="Font">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="w-full"
            value={prefs.font}
            onValueChange={(v) => v && setPrefs({ font: v as FontName })}
          >
            <ToggleGroupItem value="serif" className="flex-1 font-serif">
              Serif
            </ToggleGroupItem>
            <ToggleGroupItem value="sans" className="flex-1">
              Sans
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="flex-1">
              System
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label="Size" value={`${prefs.fontSize}px`}>
          <Slider
            min={14}
            max={28}
            step={1}
            value={[prefs.fontSize]}
            onValueChange={([v]) => v !== undefined && setPrefs({ fontSize: v })}
            aria-label="Font size"
          />
        </Field>
        <Field label="Line height" value={prefs.lineHeight.toFixed(1)}>
          <Slider
            min={1.4}
            max={2}
            step={0.1}
            value={[prefs.lineHeight]}
            onValueChange={([v]) => v !== undefined && setPrefs({ lineHeight: v })}
            aria-label="Line height"
          />
        </Field>
        <Field label="Width">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="w-full"
            value={prefs.width}
            onValueChange={(v) => v && setPrefs({ width: v as WidthName })}
          >
            <ToggleGroupItem value="narrow" className="flex-1">
              Narrow
            </ToggleGroupItem>
            <ToggleGroupItem value="medium" className="flex-1">
              Medium
            </ToggleGroupItem>
            <ToggleGroupItem value="wide" className="flex-1">
              Wide
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field label="Theme">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="w-full"
            value={prefs.theme}
            onValueChange={(v) => v && setPrefs({ theme: v as ThemeName })}
          >
            {(["light", "sepia", "dark", "system"] as const).map((t) => (
              <ToggleGroupItem key={t} value={t} className="flex-1 capitalize">
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </PopoverContent>
    </Popover>
  );
}
