import { type ChapterSummary, CONTENTS_CHAPTER_ID, type JobSummary } from "@et/contracts";
import { progressFor, STATUS_DOT, STATUS_LABEL } from "@/lib/chapter-status";
import { formatCount } from "@/lib/text";
import { cn } from "@/lib/utils";

export function ChapterRail({
  chapters,
  job,
  activeId,
  onSelect,
  pending,
}: {
  chapters: ChapterSummary[];
  job: JobSummary | undefined;
  activeId: string | undefined;
  onSelect: (chapterId: string) => void;
  pending?: ReadonlyMap<string, number>;
}) {
  return (
    <nav aria-label="Chapters" className="flex flex-col gap-0.5 p-2">
      {chapters.map((chapter) => {
        const progress = progressFor(job, chapter.id);
        const status = progress?.status ?? "idle";
        const active = chapter.id === activeId;
        const translated = job?.titles.chapters[chapter.id];
        const label =
          chapter.id === CONTENTS_CHAPTER_ID ? "Title & contents" : (translated ?? chapter.title);
        const original =
          translated && chapter.id !== CONTENTS_CHAPTER_ID && translated !== chapter.title
            ? chapter.title
            : null;
        const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;
        const suggestions = pending?.get(chapter.id) ?? 0;
        return (
          <button
            key={chapter.id}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(chapter.id)}
            className={cn(
              "group relative flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-rail-active text-rail-active-foreground"
                : "hover:bg-accent text-foreground",
            )}
          >
            <span className="flex items-center gap-2 font-mono text-[11px] tracking-wide uppercase opacity-70">
              <span>{String(chapter.index + 1).padStart(2, "0")}</span>
              <span
                role="img"
                aria-label={STATUS_LABEL[status]}
                title={STATUS_LABEL[status]}
                className={cn("size-2 rounded-full", STATUS_DOT[status])}
              />
              {suggestions > 0 && (
                <span
                  title={`${suggestions} proofreading suggestion${suggestions === 1 ? "" : "s"}`}
                  className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900 normal-case dark:bg-amber-950 dark:text-amber-100"
                >
                  {suggestions} to review
                </span>
              )}
              <span className="ml-auto">{formatCount(chapter.charCount)} chars</span>
            </span>
            <span className="line-clamp-2 text-sm leading-snug font-medium">{label}</span>
            {original && (
              <span className="line-clamp-1 text-xs leading-snug text-muted-foreground">
                {original}
              </span>
            )}
            {ratio > 0 && ratio < 1 && (
              <span className="mt-0.5 block h-0.5 overflow-hidden rounded-full bg-current/15">
                <span
                  className="block h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
