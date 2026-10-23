import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen, PencilLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBook, useChapter, useJob, useWorkspace } from "@/api/queries";
import { useJobEvents } from "@/api/use-job-events";
import { ChapterRail } from "@/components/chapter-rail";
import { ChapterContent } from "@/components/reader/chapter-view";
import { ReaderSettings } from "@/components/reader/reader-settings";
import { ViewModeToggle } from "@/components/reader/view-mode-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isBusy, progressFor } from "@/lib/chapter-status";
import { type FontName, usePrefs, type WidthName } from "@/lib/reader-settings-store";

const route = getRouteApi("/books/$bookId/read/$chapterId");

const FONT_STACK: Record<FontName, string> = {
  serif: "var(--ff-serif)",
  sans: "var(--ff-sans)",
  system: "system-ui, -apple-system, sans-serif",
};
const WIDTH_EM: Record<WidthName, number> = { narrow: 34, medium: 40, wide: 48 };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ReaderPage() {
  const { bookId, chapterId } = route.useParams();
  const search = route.useSearch();
  const navigate = useNavigate();
  const [prefs, setPrefs] = usePrefs();

  const book = useBook(bookId);
  const workspace = useWorkspace(bookId, "en");
  const jobId = search.job ?? workspace.data?.id;
  const job = useJob(jobId);
  useJobEvents(jobId);
  const chapter = useChapter(bookId, chapterId, jobId);

  const chapters = book.data?.chapters ?? [];
  const position = chapters.findIndex((c) => c.id === chapterId);
  const running = isBusy(progressFor(job.data, chapterId)?.status);
  const view = chapter.data?.chapterId === chapterId ? chapter.data : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(0);

  const go = useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      void navigate({
        to: "/books/$bookId/read/$chapterId",
        params: { bookId, chapterId: id },
        search: { job: search.job },
      });
    },
    [navigate, bookId, search.job],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll when the chapter changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrolled(0);
  }, [chapterId]);

  const prevId = view?.prevChapterId ?? chapters[position - 1]?.id ?? null;
  const nextId = view?.nextChapterId ?? chapters[position + 1]?.id ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "ArrowLeft") go(prevId);
      if (e.key === "ArrowRight") go(nextId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prevId, nextId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setScrolled(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
  };

  const sideBySide = prefs.viewMode === "side-by-side";
  const widthEm = WIDTH_EM[prefs.width];
  const proseStyle = {
    "--reader-font": FONT_STACK[prefs.font],
    "--reader-size": `${prefs.fontSize}px`,
    "--reader-lh": String(prefs.lineHeight),
    "--reader-width": sideBySide ? "100%" : `${widthEm}em`,
    maxWidth: sideBySide ? `${widthEm * 2 + 4}em` : undefined,
  } as React.CSSProperties;

  const title = book.data?.title;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card/60 px-3 py-2 md:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={prefs.railCollapsed ? "Show contents" : "Hide contents"}
          onClick={() => setPrefs({ railCollapsed: !prefs.railCollapsed })}
        >
          {prefs.railCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <h1 className="min-w-0 flex-1 truncate font-serif text-base font-semibold">
              {title ?? "Loading…"}
            </h1>
          </TooltipTrigger>
          {title && <TooltipContent>{title}</TooltipContent>}
        </Tooltip>
        <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
          Chapter {position >= 0 ? position + 1 : "–"} of {chapters.length || "–"}
        </span>
        <ViewModeToggle value={prefs.viewMode} onChange={(viewMode) => setPrefs({ viewMode })} />
        <ReaderSettings />
        <Button variant="outline" size="sm" asChild>
          <Link to="/books/$bookId" params={{ bookId }} search={{ chapter: chapterId }}>
            <PencilLine />
            <span className="hidden sm:inline">Editor</span>
          </Link>
        </Button>
      </header>
      <div
        className="h-0.5 w-full bg-border/60"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(scrolled * 100)}
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${scrolled * 100}%` }}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        {!prefs.railCollapsed && (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r bg-card/40 md:block">
            <ChapterRail
              chapters={chapters}
              job={job.data}
              activeId={chapterId}
              onSelect={(id) => go(id)}
            />
          </aside>
        )}
        <div ref={scrollRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
          <article className="reader-prose mx-auto px-5 py-10 md:px-8" style={proseStyle}>
            {view ? (
              <ChapterContent
                view={view}
                mode={prefs.viewMode}
                running={running}
                targetLang={job.data?.targetLang}
              />
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
            <nav
              aria-label="Chapter navigation"
              className="mt-12 flex items-stretch justify-between gap-3 border-t pt-6 font-sans text-sm"
            >
              <Button variant="outline" disabled={!prevId} onClick={() => go(prevId)}>
                <ArrowLeft /> Previous
              </Button>
              <Button variant="outline" disabled={!nextId} onClick={() => go(nextId)}>
                Next <ArrowRight />
              </Button>
            </nav>
          </article>
        </div>
      </div>
    </div>
  );
}
