import { Type } from "lucide-react";
import { THEMES } from "@/components/settings-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type FontName,
  type Layout,
  type ThemeName,
  usePrefs,
  type ViewMode,
  type WidthName,
} from "@/lib/reader-settings-store";
import { cn } from "@/lib/utils";

const ITEM = "h-auto min-h-9 min-w-0 flex-1 py-1.5 leading-tight whitespace-normal coarse:min-h-11";

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
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {value && <span className="text-xs tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  itemClassName,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: React.ReactNode; className?: string }[];
  onChange: (value: T) => void;
  itemClassName?: string;
}) {
  return (
    <Field label={label}>
      <ToggleGroup
        type="single"
        variant="outline"
        className="w-full"
        aria-label={label}
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className={cn(ITEM, itemClassName, o.className)}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

const VIEWS: { value: ViewMode; label: string }[] = [
  { value: "translation", label: "Translation" },
  { value: "interleaved", label: "Interleaved" },
  { value: "side-by-side", label: "Side by side" },
];

const LAYOUTS: { value: Layout; label: string }[] = [
  { value: "scroll", label: "Scroll" },
  { value: "paged", label: "Paged" },
];

const FONTS: { value: FontName; label: string; className?: string }[] = [
  { value: "serif", label: "Serif", className: "font-serif" },
  { value: "sans", label: "Sans" },
  { value: "system", label: "System" },
];

const WIDTHS: { value: WidthName; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
];

const THEME_OPTIONS = THEMES.map((t) => ({
  value: t.value,
  label: (
    <span className="flex min-w-0 flex-col items-center gap-1.5">
      <span
        aria-hidden
        className="block h-5 w-7 rounded-[5px] border border-foreground/30"
        style={{ background: t.swatch }}
      />
      {t.label}
    </span>
  ),
}));

export function ReaderSettings() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" aria-label="Reader settings">
          <Type />
          <span className="max-sm:hidden">Aa</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="gap-0 max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-auto max-sm:max-h-[86dvh] max-sm:w-full max-sm:rounded-t-xl max-sm:border-t max-sm:border-l-0"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Reader settings</SheetTitle>
          <SheetDescription className="sr-only">
            View, layout, font, size, width and theme
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <Choice
            label="View"
            value={prefs.viewMode}
            options={VIEWS}
            onChange={(viewMode) => setPrefs({ viewMode })}
          />
          <div className="space-y-2">
            <Choice
              label="Layout"
              value={prefs.layout}
              options={LAYOUTS}
              onChange={(layout) => setPrefs({ layout })}
            />
            {prefs.layout === "paged" && prefs.viewMode === "side-by-side" && (
              <p className="text-xs text-muted-foreground">Side by side always scrolls.</p>
            )}
          </div>
          <Choice
            label="Font"
            value={prefs.font}
            options={FONTS}
            onChange={(font) => setPrefs({ font })}
          />
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
          <Choice
            label="Width"
            value={prefs.width}
            options={WIDTHS}
            onChange={(width) => setPrefs({ width })}
          />
          <Choice
            label="Theme"
            value={prefs.theme}
            options={THEME_OPTIONS}
            onChange={(theme: ThemeName) => setPrefs({ theme })}
            itemClassName="px-1 py-2"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
