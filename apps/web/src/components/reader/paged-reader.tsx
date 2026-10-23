import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clampPage,
  firstVisibleIndex,
  keyToAction,
  type PageAction,
  pageCount,
  pageOfOffset,
  recomputePage,
  resolveNav,
  type StartAt,
  swipeAction,
  tapAction,
} from "@/lib/pagination";

const GAP = 48;
const PAD_X = 28;
const PAD_Y = 24;
const BLOCKS = "[data-testid='segment-row'], [data-testid='static-block']";
const KEY_IGNORED = "header, [role='dialog'], [role='menu'], [role='slider'], [role='listbox']";

export interface PagePosition {
  page: number;
  count: number;
}

interface Props {
  children?: React.ReactNode;
  startAt: StartAt;
  ready: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  maxPageWidth: number;
  layoutKey: string;
  style?: React.CSSProperties;
  onChapter: (direction: PageAction, startAt: StartAt) => void;
  onPosition?: (position: PagePosition) => void;
}

function ignoresKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest(`input, textarea, select, ${KEY_IGNORED}`)) {
    return true;
  }
  return key === " " && target.closest("button, a") !== null;
}

export function PagedReader({
  children,
  startAt,
  ready,
  hasPrev,
  hasNext,
  maxPageWidth,
  layoutKey,
  style,
  onChapter,
  onPosition,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Element | null>(null);
  const pendingLastRef = useRef(startAt === "last");
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [page, setPageState] = useState(0);
  const [count, setCountState] = useState(1);
  const pageRef = useRef(0);
  const countRef = useRef(1);

  const pageWidth = Math.max(1, Math.min(size.w - PAD_X * 2, maxPageWidth));
  const pageHeight = Math.max(1, size.h - PAD_Y * 2);
  const step = pageWidth + GAP;
  const left = Math.max(0, (size.w - pageWidth) / 2);

  const commitPage = useCallback((next: number) => {
    pageRef.current = next;
    setPageState(next);
  }, []);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const recount = useCallback(() => {
    const el = columnsRef.current;
    if (!el || size.w === 0) return;
    const next = pageCount({ scrollWidth: el.scrollWidth, pageWidth, gap: GAP });
    countRef.current = next;
    setCountState(next);
    if (pendingLastRef.current && ready) {
      pendingLastRef.current = false;
      commitPage(next - 1);
      return;
    }
    const anchor = anchorRef.current;
    const anchorOffset = anchor && el.contains(anchor) ? (anchor as HTMLElement).offsetLeft : null;
    commitPage(recomputePage({ anchorOffset, step, count: next, page: pageRef.current }));
  }, [size.w, pageWidth, step, ready, commitPage]);

  const recountRef = useRef(recount);
  recountRef.current = recount;

  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey signals style changes that move content between columns
  useLayoutEffect(() => {
    recount();
  }, [recount, layoutKey, pageHeight]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: anchor is re-picked only when the page changes, not when layout shifts
  useLayoutEffect(() => {
    const el = columnsRef.current;
    if (!el) return;
    const blocks = Array.from(el.querySelectorAll<HTMLElement>(BLOCKS));
    const index = firstVisibleIndex(
      blocks.map((b) => b.offsetLeft),
      page,
      step,
    );
    anchorRef.current = blocks[index] ?? null;
  }, [page]);

  useEffect(() => {
    const el = columnsRef.current;
    if (!el) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recountRef.current());
    };
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    el.addEventListener("load", schedule, true);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      el.removeEventListener("load", schedule, true);
    };
  }, []);

  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  useEffect(() => {
    onPositionRef.current?.({ page, count });
  }, [page, count]);

  const act = useCallback(
    (action: PageAction) => {
      const result = resolveNav(action, {
        page: pageRef.current,
        count: countRef.current,
        hasPrev,
        hasNext,
      });
      if (result.type === "page") commitPage(result.page);
      if (result.type === "chapter") onChapter(result.direction, result.startAt);
    },
    [hasPrev, hasNext, commitPage, onChapter],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyToAction(e);
      if (!action || ignoresKeys(e.target, e.key)) return;
      e.preventDefault();
      act(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const action = tapAction(e.clientX - rect.left, rect.width);
    if (action) act(action);
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchRef.current;
    const t = e.changedTouches[0];
    touchRef.current = null;
    if (!start || !t) return;
    const action = swipeAction(t.clientX - start.x, t.clientY - start.y);
    if (action) act(action);
  };

  const onFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const columns = columnsRef.current;
    const target = e.target as HTMLElement;
    if (!columns || target === e.currentTarget || !columns.contains(target)) return;
    const x = target.getBoundingClientRect().left - columns.getBoundingClientRect().left;
    const absolute = x + pageRef.current * step;
    commitPage(clampPage(pageOfOffset(absolute, step), countRef.current));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard paging is handled on window */}
      <section
        aria-label="Chapter text"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the text shows a focus ring and receives paging keys
        tabIndex={0}
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden outline-none select-text focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        ref={viewportRef}
        onClick={onClick}
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          touchRef.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={onTouchEnd}
        onFocusCapture={onFocusCapture}
        onScroll={(e) => {
          e.currentTarget.scrollLeft = 0;
          e.currentTarget.scrollTop = 0;
        }}
      >
        <div
          ref={columnsRef}
          data-testid="paged-columns"
          className="reader-prose reader-columns"
          style={{
            ...style,
            position: "absolute",
            top: PAD_Y,
            left,
            width: pageWidth,
            height: pageHeight,
            maxWidth: "none",
            columnWidth: pageWidth,
            columnGap: GAP,
            columnFill: "auto",
            transform: `translateX(${-page * step}px)`,
            ["--page-h" as string]: `${pageHeight}px`,
          }}
        >
          {children}
        </div>
      </section>
      <footer className="flex items-center justify-center gap-3 border-t bg-card/60 px-3 py-1.5 font-sans text-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page === 0 && !hasPrev}
          onClick={() => act("prev")}
        >
          <ChevronLeft />
        </Button>
        <span role="status" className="min-w-24 text-center font-mono text-xs tabular-nums">
          {`Page ${page + 1} / ${count}`}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= count - 1 && !hasNext}
          onClick={() => act("next")}
        >
          <ChevronRight />
        </Button>
      </footer>
    </div>
  );
}
