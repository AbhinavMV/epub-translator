import { CONTENTS_CHAPTER_ID } from "@et/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBook, useChapter, useJob, useProject, useWorkspace } from "@/api/queries";
import { useJobEvents } from "@/api/use-job-events";
import { AppHeader, type Crumb, volumeLabel } from "@/components/app-header";
import { ChapterRailPanel, ChapterSheet } from "@/components/chapter-rail";
import { PartSentinel } from "@/components/part-sentinel";
import { ChapterContent } from "@/components/reader/chapter-view";
import { PagedReader, type PagePosition } from "@/components/reader/paged-reader";
import { ReaderSettings } from "@/components/reader/reader-settings";
import { UntranslatedNotice } from "@/components/reader/untranslated-notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { chapterStatus, isBusy, progressFor } from "@/lib/chapter-status";
import { useRecordLastOpened } from "@/lib/last-opened-store";
import { effectiveLayout, type PageAction, type StartAt } from "@/lib/pagination";
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
  useRecordLastOpened(
    bookId,
    position >= 0 && chapterId !== CONTENTS_CHAPTER_ID ? chapterId : undefined,
  );
  const summary = position >= 0 ? chapters[position] : undefined;
  const progress = progressFor(job.data, chapterId);
  const running = isBusy(progress?.status);
  const status = job.data && summary ? chapterStatus(progress, summary.segmentCount) : undefined;
  const showNotice = status !== undefined && status.translated < status.total;
  const view = chapter.data?.chapterId === chapterId ? chapter.data : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(0);
  const [startAt, setStartAt] = useState<StartAt>("first");
  const [contentsOpen, setContentsOpen] = useState(false);
  const paged = effectiveLayout(prefs.layout, prefs.viewMode) === "paged";

  const go = useCallback(
    (id: string | null | undefined, landOn: StartAt = "first") => {
      if (!id) return;
      setStartAt(landOn);
      void navigate({
        to: "/books/$bookId/read/$chapterId",
        params: { bookId, chapterId: id },
        search: { job: search.job },
      });
    },
    [navigate, bookId, search.job],
  );
  const rail = {
    chapters,
    job: job.data,
    activeId: chapterId,
    onSelect: (id: string) => go(id),
    sourceLang: book.data?.sourceLang,
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll when the chapter changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrolled(0);
  }, [chapterId]);

  const { hasMore, loadingMore, loadMore } = chapter;
  const loadAllBeforeLanding = paged && startAt === "last" && hasMore;
  useEffect(() => {
    if (loadAllBeforeLanding && !loadingMore) loadMore();
  }, [loadAllBeforeLanding, loadingMore, loadMore]);

  const prevId = view?.prevChapterId ?? chapters[position - 1]?.id ?? null;
  const nextId = view?.nextChapterId ?? chapters[position + 1]?.id ?? null;

  const onPagedChapter = useCallback(
    (direction: PageAction, landOn: StartAt) => go(direction === "next" ? nextId : prevId, landOn),
    [go, nextId, prevId],
  );

  const onPosition = useCallback(
    ({ page, count }: PagePosition) => setScrolled((page + 1) / count),
    [],
  );

  useEffect(() => {
    if (paged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "ArrowLeft") go(prevId);
      if (e.key === "ArrowRight") go(nextId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prevId, nextId, paged]);

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

  const project = useProject(book.data?.projectId);
  const crumbs: Crumb[] = [{ kind: "library" }];
  if (project.data) {
    crumbs.push({ kind: "project", projectId: project.data.id, name: project.data.name });
  }
  const translatedTitle =
    chapterId === CONTENTS_CHAPTER_ID ? undefined : job.data?.titles.chapters[chapterId];
  const chapterTitle =
    chapterId === CONTENTS_CHAPTER_ID
      ? "Book title & navigation"
      : (translatedTitle ?? summary?.title ?? view?.title ?? "…");
  const volume = book.data
    ? volumeLabel({
        ...book.data,
        translatedTitle: job.data?.titles.book || book.data.translatedTitle,
      })
    : undefined;
  crumbs.push({
    kind: "current",
    label: chapterTitle,
    lang:
      translatedTitle || chapterId === CONTENTS_CHAPTER_ID
        ? undefined
        : (book.data?.sourceLang ?? undefined),
    hint: volume ? `${volume} · ${chapterTitle}` : chapterTitle,
  });

  const content = view ? (
    <>
      {showNotice && status && (
        <UntranslatedNotice
          status={status}
          sourceLang={book.data?.sourceLang}
          bookId={bookId}
          chapterId={chapterId}
        />
      )}
      <ChapterContent
        view={view}
        mode={prefs.viewMode}
        running={running}
        targetLang={job.data?.targetLang}
      />
    </>
  ) : (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
  const layoutKey = [
    prefs.font,
    prefs.fontSize,
    prefs.lineHeight,
    prefs.width,
    prefs.viewMode,
    running,
    showNotice && status ? `${status.translated}/${status.total}` : "",
  ].join("|");

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        crumbs={crumbs}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Contents"
              onClick={() => setContentsOpen(true)}
            >
              <List />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="max-md:hidden"
              aria-label={prefs.railCollapsed ? "Show contents" : "Hide contents"}
              onClick={() => setPrefs({ railCollapsed: !prefs.railCollapsed })}
            >
              {prefs.railCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <ReaderSettings />
            <Button variant="ghost" className="max-sm:hidden" asChild>
              <Link to="/books/$bookId" params={{ bookId }} search={{ chapter: chapterId }}>
                <PencilLine />
                Edit
              </Link>
            </Button>
          </>
        }
      />
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
          <ChapterRailPanel
            title="Contents"
            className="hidden w-64 shrink-0 md:flex"
            {...rail}
            compact
          />
        )}
        <ChapterSheet
          title="Contents"
          open={contentsOpen}
          onOpenChange={setContentsOpen}
          {...rail}
        />
        {paged ? (
          <PagedReader
            key={chapterId}
            startAt={startAt}
            ready={Boolean(view) && !(startAt === "last" && chapter.hasMore)}
            hasPrev={Boolean(prevId)}
            hasNext={Boolean(nextId)}
            hasMore={chapter.hasMore}
            onNeedMore={chapter.loadMore}
            maxPageWidth={widthEm * prefs.fontSize}
            layoutKey={layoutKey}
            style={proseStyle}
            onChapter={onPagedChapter}
            onPosition={onPosition}
          >
            {content}
          </PagedReader>
        ) : (
          <div ref={scrollRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
            <article className="reader-prose mx-auto px-5 py-10 md:px-8" style={proseStyle}>
              {content}
              <PartSentinel
                hasMore={chapter.hasMore}
                loading={chapter.loadingMore}
                onVisible={chapter.loadMore}
              />
              <nav
                aria-label="Chapter navigation"
                className="mt-12 flex items-stretch justify-between gap-2 border-t pt-6 font-sans text-sm"
              >
                <Button variant="outline" disabled={!prevId} onClick={() => go(prevId)}>
                  <ArrowLeft /> Previous
                </Button>
                {position >= 0 && (
                  <span className="self-center text-center text-xs text-muted-foreground tabular-nums">
                    {position + 1} of {chapters.length}
                  </span>
                )}
                <Button variant="outline" disabled={!nextId} onClick={() => go(nextId)}>
                  Next <ArrowRight />
                </Button>
              </nav>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
