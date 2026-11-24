import { type ChapterSummary, CONTENTS_CHAPTER_ID, type JobSummary } from "@et/contracts";
import { ChapterStatusIcon } from "@/components/chapter-status-icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { contentsFirst } from "@/lib/chapter-order";
import { chapterStatus, progressFor } from "@/lib/chapter-status";
import { cn } from "@/lib/utils";

export interface ChapterRailProps {
  chapters: ChapterSummary[];
  job: JobSummary | undefined;
  activeId: string | undefined;
  onSelect: (chapterId: string) => void;
  pending?: ReadonlyMap<string, number>;
  sourceLang?: string | null;
  compact?: boolean;
}

export function ChapterRail({
  chapters,
  job,
  activeId,
  onSelect,
  pending,
  sourceLang,
  compact = false,
}: ChapterRailProps) {
  return (
    <nav aria-label="Chapters" className="flex flex-col gap-0.5 p-2">
      {contentsFirst(chapters).map((chapter) => {
        const status = chapterStatus(progressFor(job, chapter.id), chapter.segmentCount);
        const active = chapter.id === activeId;
        const generated = chapter.id === CONTENTS_CHAPTER_ID;
        const translated = generated ? undefined : job?.titles.chapters[chapter.id];
        const label = generated ? "Book title & navigation" : (translated ?? chapter.title);
        const original = translated && translated !== chapter.title ? chapter.title : undefined;
        const titleLang = generated || translated ? undefined : (sourceLang ?? undefined);
        const suggestions = pending?.get(chapter.id) ?? 0;
        return (
          <button
            key={chapter.id}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(chapter.id)}
            className={cn(
              "grid min-h-11 w-full grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
              active
                ? "bg-rail-active text-rail-active-foreground"
                : "text-foreground hover:bg-accent",
            )}
          >
            <ChapterStatusIcon status={status} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                title={original}
                lang={titleLang}
                className="line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]"
              >
                {label}
              </span>
              {(!compact || suggestions > 0) && (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs opacity-70">
                  {!compact && <span className="tabular-nums">{status.detail}</span>}
                  {suggestions > 0 && (
                    <span
                      title={`${suggestions} proofreading suggestion${suggestions === 1 ? "" : "s"}`}
                      className="rounded-full bg-flag/15 px-1.5 text-foreground"
                    >
                      {suggestions} to review
                    </span>
                  )}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function doneCount(chapters: ChapterSummary[], job: JobSummary | undefined): number {
  return chapters.filter(
    (c) => chapterStatus(progressFor(job, c.id), c.segmentCount).state === "done",
  ).length;
}

export function ChapterRailPanel({
  title,
  className,
  ...rail
}: ChapterRailProps & { title: string; className?: string }) {
  return (
    <aside className={cn("flex-col border-r bg-card/40", className)}>
      <h2 className="flex flex-wrap items-baseline justify-between gap-x-2 px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        {rail.chapters.length > 0 && (
          <span className="tabular-nums">
            {doneCount(rail.chapters, rail.job)} of {rail.chapters.length} done
          </span>
        )}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChapterRail {...rail} />
      </div>
    </aside>
  );
}

export function ChapterSheet({
  title,
  open,
  onOpenChange,
  onSelect,
  ...rail
}: ChapterRailProps & { title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(20rem,88%)] max-w-none gap-0 p-0 sm:max-w-none">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Choose a chapter</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChapterRail
            {...rail}
            compact
            onSelect={(id) => {
              onOpenChange(false);
              onSelect(id);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
