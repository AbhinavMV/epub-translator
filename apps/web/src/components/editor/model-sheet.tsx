import type { ProviderInfo, TranslateMode } from "@et/contracts";
import { TARGET_LANGUAGES } from "@et/contracts";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { modelName } from "@/lib/model-name";
import { cn } from "@/lib/utils";
import { ModeToggle } from "./mode-toggle";
import type { Selection } from "./model-selection";
import { ProviderSelect } from "./provider-select";

export function ModelSheet({
  providers,
  selection,
  onSelection,
  mode,
  batchAvailable,
  onMode,
  targetLang,
  onTargetLang,
  open: openProp,
  onOpenChange,
}: {
  providers: ProviderInfo[] | undefined;
  selection: Selection | null;
  onSelection: (s: Selection) => void;
  mode: TranslateMode;
  batchAvailable: boolean;
  onMode: (mode: TranslateMode) => void;
  targetLang: string;
  onTargetLang: (code: string) => void;
  /** Controls the sheet from outside, e.g. from the phone editor's More sheet. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const model = selection ? modelName(selection.model) : "Choose a model";
  const modeName = mode === "batch" ? "Batch" : "Live";
  const language = TARGET_LANGUAGES.find((l) => l.code === targetLang)?.name ?? targetLang;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-auto min-h-9 max-w-full min-w-0 justify-start py-1 text-left whitespace-normal"
        aria-label={`Model and mode: ${model}, ${modeName}, ${language}`}
        onClick={() => setOpen(true)}
      >
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            selection ? "bg-ok" : "bg-muted-foreground/50",
          )}
        />
        <span className="min-w-0 break-words">
          {model}
          <span className="text-muted-foreground">
            {" "}
            · {modeName} · {language}
          </span>
        </span>
        <ChevronDown className="opacity-60" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Model and mode</SheetTitle>
            <SheetDescription>
              The glossary and custom prompt come from the project.
            </SheetDescription>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 pb-4">
            <ProviderSelect
              stacked
              providers={providers}
              selection={selection}
              onChange={onSelection}
            />
            <div className="grid gap-2">
              <span className="text-sm font-medium">Mode</span>
              <ModeToggle mode={mode} batchAvailable={batchAvailable} onChange={onMode} />
              <p className="text-xs text-muted-foreground">
                {batchAvailable
                  ? "Batch costs half and returns within 24 hours."
                  : "This provider has no batch API."}
              </p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="model-sheet-lang" className="text-sm font-medium">
                Translate into
              </label>
              <Select value={targetLang} onValueChange={onTargetLang}>
                <SelectTrigger
                  id="model-sheet-lang"
                  size="sm"
                  className="w-full"
                  aria-label="Target language"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
