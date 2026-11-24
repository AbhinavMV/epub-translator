import type { ChapterProgress } from "@et/contracts";
import { Check, ChevronDown, Heading, Languages, List, Loader2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { ExportMenu } from "@/components/editor/export-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isBusy } from "@/lib/chapter-status";

export type TranslateActionKind = "translate" | "continue" | "retry" | "done" | "busy";

export interface TranslateAction {
  kind: TranslateActionKind;
  label: string;
}

/** What the chapter's Translate button offers next; the bottom bar on phones reads it too. */
export function translateAction(p: ChapterProgress | undefined): TranslateAction {
  if (!p) return { kind: "translate", label: "Translate chapter" };
  if (isBusy(p.status)) {
    const translated = Math.min(p.total, p.done + p.flagged);
    const label =
      p.status === "running"
        ? `Translating ${translated}/${p.total}`
        : p.status === "submitted"
          ? "Submitted"
          : "Queued";
    return { kind: "busy", label };
  }
  if (p.error) return { kind: "retry", label: "Try again" };
  const translated = p.done + p.flagged;
  const left = p.total - translated - p.failed;
  if (left > 0) {
    return translated > 0
      ? { kind: "continue", label: "Continue" }
      : { kind: "translate", label: "Translate chapter" };
  }
  if (p.failed > 0) return { kind: "retry", label: `Retry ${p.failed} failed` };
  return { kind: "done", label: "Translated" };
}

const ICON: Record<TranslateActionKind, ReactNode> = {
  translate: <Languages />,
  continue: <Languages />,
  retry: <RotateCcw />,
  done: <Check />,
  busy: <Loader2 className="animate-spin" />,
};

function TranslateSplitButton({
  chapterProgress,
  canTranslate,
  noProviderHint,
  starting,
  titlesBusy,
  onTranslate,
  onTranslateAll,
  onTranslateTitles,
}: {
  chapterProgress: ChapterProgress | undefined;
  canTranslate: boolean;
  noProviderHint: string;
  starting: boolean;
  titlesBusy: boolean;
  onTranslate: () => void;
  onTranslateAll: () => void;
  onTranslateTitles: () => void;
}) {
  const action = translateAction(chapterProgress);
  const blocked = action.kind === "busy" || action.kind === "done";
  const main = (
    <Button
      size="sm"
      className="min-w-0 rounded-r-none"
      onClick={onTranslate}
      disabled={!canTranslate || starting || blocked}
    >
      {starting && !blocked ? <Loader2 className="animate-spin" /> : ICON[action.kind]}
      <span className="truncate">{action.label}</span>
    </Button>
  );

  return (
    <div className="inline-flex min-w-0">
      {canTranslate ? (
        main
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus; the tooltip needs a focusable wrapper */}
            <span tabIndex={0} className="inline-flex min-w-0">
              {main}
            </span>
          </TooltipTrigger>
          <TooltipContent>{noProviderHint}</TooltipContent>
        </Tooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            className="rounded-l-none border-l border-primary-foreground/30"
            disabled={!canTranslate}
            aria-label="More translate options"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-2rem)]">
          <DropdownMenuItem disabled={starting || blocked} onSelect={onTranslate}>
            <Languages />
            This chapter
          </DropdownMenuItem>
          <DropdownMenuItem disabled={starting} onSelect={onTranslateAll}>
            <List />
            All chapters
          </DropdownMenuItem>
          <DropdownMenuItem disabled={starting || titlesBusy} onSelect={onTranslateTitles}>
            <Heading />
            Title & contents
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function EditorToolbar({
  model,
  proofread,
  chapterProgress,
  canTranslate,
  noProviderHint,
  starting,
  titlesBusy,
  hasTranslation,
  onTranslate,
  onTranslateAll,
  onTranslateTitles,
  epubHref,
  bilingualEpubHref,
  txtHref,
  onExport,
}: {
  model: ReactNode;
  proofread: ReactNode;
  chapterProgress: ChapterProgress | undefined;
  canTranslate: boolean;
  noProviderHint: string;
  starting: boolean;
  titlesBusy: boolean;
  hasTranslation: boolean;
  onTranslate: () => void;
  onTranslateAll: () => void;
  onTranslateTitles: () => void;
  epubHref: string | undefined;
  bilingualEpubHref: string | undefined;
  txtHref: string | undefined;
  onExport?: ((href: string) => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-5">
      <div className="flex min-w-0 max-w-full">{model}</div>
      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {proofread}
        <ExportMenu
          translationHref={epubHref}
          bilingualHref={bilingualEpubHref}
          txtHref={txtHref}
          onExport={onExport}
          disabled={!hasTranslation}
          hint="Translate a chapter first"
        />
        <TranslateSplitButton
          chapterProgress={chapterProgress}
          canTranslate={canTranslate}
          noProviderHint={noProviderHint}
          starting={starting}
          titlesBusy={titlesBusy}
          onTranslate={onTranslate}
          onTranslateAll={onTranslateAll}
          onTranslateTitles={onTranslateTitles}
        />
      </div>
    </div>
  );
}
