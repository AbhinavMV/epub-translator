import type { ChapterProgress } from "@et/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Languages,
  Loader2,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isBusy, STATUS_LABEL } from "@/lib/chapter-status";

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
  hasPrev,
  hasNext,
  hasTranslation,
  onTranslate,
  onTranslateAll,
  onPrev,
  onNext,
  onCancel,
  epubHref,
  txtHref,
}: {
  chapterProgress: ChapterProgress | undefined;
  busyCount: number;
  translatedChapters: number;
  totalChapters: number;
  canTranslate: boolean;
  noProviderHint: string;
  starting: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  hasTranslation: boolean;
  onTranslate: () => void;
  onTranslateAll: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCancel: () => void;
  epubHref: string | undefined;
  txtHref: string | undefined;
}) {
  const busy = isBusy(chapterProgress?.status);
  const ratio = totalChapters > 0 ? (translatedChapters / totalChapters) * 100 : 0;
  const segmentsDone = chapterProgress ? chapterProgress.done + chapterProgress.failed : 0;

  const translateButton = (
    <Button size="sm" onClick={onTranslate} disabled={!canTranslate || busy || starting}>
      {busy || starting ? <Loader2 className="animate-spin" /> : <Languages />}
      {busy
        ? chapterProgress?.status === "submitted"
          ? "Submitted"
          : "Translating…"
        : "Translate chapter"}
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
        <DownloadButton
          href={epubHref}
          disabled={!hasTranslation}
          label="Export EPUB"
          icon={<Download />}
          variant="secondary"
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
