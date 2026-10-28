import type { Layout, ViewMode } from "@/lib/reader-settings-store";

export type ReaderLayout = Layout;
export type PageAction = "next" | "prev";
export type StartAt = "first" | "last";

export type NavResult =
  | { type: "page"; page: number }
  | { type: "chapter"; direction: PageAction; startAt: StartAt }
  | { type: "none" };

export function effectiveLayout(layout: ReaderLayout, viewMode: ViewMode): ReaderLayout {
  return viewMode === "side-by-side" ? "scroll" : layout;
}

export function pageCount({
  scrollWidth,
  pageWidth,
  gap,
}: {
  scrollWidth: number;
  pageWidth: number;
  gap: number;
}): number {
  if (pageWidth <= 0) return 1;
  return Math.max(1, Math.round((scrollWidth + gap) / (pageWidth + gap)));
}

export function shouldFetchNextPart(
  position: { page: number; count: number },
  hasMore: boolean,
  loading: boolean,
): boolean {
  return hasMore && !loading && position.page >= position.count - 2;
}

export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(0, count - 1), Math.max(0, page));
}

export function pageOfOffset(offset: number, step: number): number {
  if (step <= 0) return 0;
  return Math.max(0, Math.floor(offset / step + 1e-6));
}

export function firstVisibleIndex(offsets: number[], page: number, step: number): number {
  const start = page * step - 1;
  return offsets.findIndex((o) => o >= start);
}

export function recomputePage({
  anchorOffset,
  step,
  count,
  page,
}: {
  anchorOffset: number | null;
  step: number;
  count: number;
  page: number;
}): number {
  const target = anchorOffset === null ? page : pageOfOffset(anchorOffset, step);
  return clampPage(target, count);
}

export function keyToAction(e: {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): PageAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case "ArrowLeft":
    case "PageUp":
      return "prev";
    case " ":
      return e.shiftKey ? "prev" : "next";
    default:
      return null;
  }
}

const TAP_ZONE = 0.3;

export function tapAction(x: number, width: number): PageAction | null {
  if (width <= 0) return null;
  if (x < width * TAP_ZONE) return "prev";
  if (x > width * (1 - TAP_ZONE)) return "next";
  return null;
}

const SWIPE_MIN = 50;

export function swipeAction(dx: number, dy: number): PageAction | null {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx) / 2) return null;
  return dx < 0 ? "next" : "prev";
}

export function resolveNav(
  action: PageAction,
  s: { page: number; count: number; hasPrev: boolean; hasNext: boolean },
): NavResult {
  if (action === "next") {
    if (s.page < s.count - 1) return { type: "page", page: s.page + 1 };
    return s.hasNext ? { type: "chapter", direction: "next", startAt: "first" } : { type: "none" };
  }
  if (s.page > 0) return { type: "page", page: s.page - 1 };
  return s.hasPrev ? { type: "chapter", direction: "prev", startAt: "last" } : { type: "none" };
}
