import { cn } from "@/lib/utils";

export type EditorView = "translation" | "source" | "both";

const VIEWS: { value: EditorView; label: string }[] = [
  { value: "translation", label: "Translation" },
  { value: "source", label: "Source" },
  { value: "both", label: "Both" },
];

export function ViewSwitch({
  view,
  onChange,
  className,
}: {
  view: EditorView;
  onChange: (view: EditorView) => void;
  className?: string;
}) {
  return (
    <div className={cn("border-b bg-background px-3 py-2", className)}>
      <fieldset aria-label="Show" className="flex min-w-0 gap-0.5 rounded-md bg-muted p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            onClick={() => onChange(v.value)}
            className={cn(
              "min-h-8 flex-auto rounded-sm px-2 py-1 text-sm font-medium break-words text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring coarse:min-h-11",
              view === v.value && "bg-background text-foreground shadow-xs",
            )}
          >
            {v.label}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
