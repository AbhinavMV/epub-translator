import type { ChapterProgress } from "@et/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Heading,
  Languages,
  Loader2,
  RotateCcw,
  Square,
} from "lucide-react";
import { ExportEpubMenu } from "@/components/editor/export-epub-menu";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isBusy, STATUS_LABEL } from "@/lib/chapter-status";

function translateAction(p: ChapterProgress | undefined): {
  label: string;
  done: boolean;
  retry: boolean;
} {
  if (!p) return { label: "Translate chapter", done: false, retry: false };
  if (p.error) return { label: "Try again", done: false, retry: true };
  if (p.status === "done") return { label: "Translated", done: true, retry: false };
  if (p.failed > 0) {
    return { label: `Retry ${p.failed} failed`, done: false, retry: true };
  }
  if (p.done + p.flagged > 0) return { label: "Continue", done: false, retry: false };
  return { label: "Translate chapter", done: false, retry: false };
}

function DownloadButton({
  href,
  disabled,
  label,
  icon,
  variant,
  hint,
}: {
  href: string | undefined;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
  variant: "outline" | "secondary";
  hint: string;
}) {
  if (disabled || !href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus; the tooltip needs a focusable wrapper */}
          <span tabIndex={0}>
            <Button variant={variant} size="sm" disabled aria-label={label}>
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button variant={variant} size="sm" asChild>
      <a href={href} download aria-label={label}>
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </a>
    </Button>
  );
}

export function EditorToolbar({
  chapterProgress,
  busyCount,
  translatedChapters,
  totalChapters,
  canTranslate,
  noProviderHint,
  starting,
  titlesBusy,
  hasPrev,
  hasNext,
  hasTranslation,
  onTranslate,
  onTranslateAll,
  onTranslateTitles,
  onPrev,
  onNext,
  onCancel,
  onCheckBatch,
  epubHref,
  bilingualEpubHref,
  txtHref,
}: {
  chapterProgress: ChapterProgress | undefined;
  busyCount: number;
  translatedChapters: number;
  totalChapters: number;
  canTranslate: boolean;
  noProviderHint: string;
  starting: boolean;
  titlesBusy: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  hasTranslation: boolean;
  onTranslate: () => void;
  onTranslateAll: () => void;
  onTranslateTitles: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCancel: () => void;
  onCheckBatch?: () => void;
  epubHref: string | undefined;
  bilingualEpubHref: string | undefined;
  txtHref: string | undefined;
}) {
  const busy = isBusy(chapterProgress?.status);
  const ratio = totalChapters > 0 ? (translatedChapters / totalChapters) * 100 : 0;
  const segmentsDone = chapterProgress ? chapterProgress.done + chapterProgress.failed : 0;

  const action = translateAction(chapterProgress);
  const translateButton = (
    <Button
      size="sm"
      onClick={onTranslate}
      disabled={!canTranslate || busy || starting || action.done}
    >
      {busy || starting ? (
        <Loader2 className="animate-spin" />
      ) : action.done ? (
        <Check />
      ) : action.retry ? (
        <RotateCcw />
      ) : (
        <Languages />
      )}
      {busy
        ? chapterProgress?.status === "submitted"
          ? "Submitted"
          : "Translating…"
        : action.label}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-4">
      {canTranslate ? (
        translateButton
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus; the tooltip needs a focusable wrapper */}
            <span tabIndex={0}>{translateButton}</span>
          </TooltipTrigger>
          <TooltipContent>{noProviderHint}</TooltipContent>
        </Tooltip>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onTranslateAll}
        disabled={!canTranslate || starting}
      >
        <span className="hidden sm:inline">Translate all</span>
        <span className="sm:hidden">All</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onTranslateTitles}
        disabled={!canTranslate || starting || titlesBusy}
        aria-label="Translate title & contents"
      >
        <Heading />
        <span className="hidden xl:inline">Translate title & contents</span>
        <span className="xl:hidden">Titles</span>
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous chapter"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next chapter"
          disabled={!hasNext}
          onClick={onNext}
        >
          <ArrowRight />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <DownloadButton
          href={txtHref}
          disabled={!hasTranslation}
          label="Export TXT"
          icon={<FileText />}
          variant="outline"
          hint="Translate a chapter first"
        />
        <ExportEpubMenu
          translationHref={epubHref}
          bilingualHref={bilingualEpubHref}
          disabled={!hasTranslation}
          hint="Translate a chapter first"
        />
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {(busy || busyCount > 0) && (
          <span
            role="status"
            className="inline-flex items-center gap-2 rounded-full bg-primary/10 py-1 pr-1 pl-2.5 text-xs font-medium text-primary"
          >
            <Loader2 className="size-3 animate-spin" />
            {busy && chapterProgress?.status === "running"
              ? `Translating ${segmentsDone}/${chapterProgress.total} segments…`
              : busy && chapterProgress?.status === "submitted"
                ? STATUS_LABEL.submitted
                : busy
                  ? "Queued…"
                  : `Translating ${busyCount} other chapter${busyCount > 1 ? "s" : ""}…`}
            {onCheckBatch && busy && chapterProgress?.status === "submitted" ? (
              <button
                type="button"
                onClick={onCheckBatch}
                className="rounded-full px-2 py-0.5 text-[11px] hover:bg-primary/15"
              >
                Check batch
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel translation"
              className="flex size-5 items-center justify-center rounded-full hover:bg-primary/15"
            >
              <Square className="size-2.5 fill-current" />
            </button>
          </span>
        )}
        <div className="flex items-center gap-2">
          <Progress value={ratio} className="h-1.5 w-20" aria-label="Chapters translated" />
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {translatedChapters} / {totalChapters} translated
          </span>
        </div>
      </div>
    </div>
  );
}
