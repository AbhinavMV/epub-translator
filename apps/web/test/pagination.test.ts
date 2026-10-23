import { describe, expect, it } from "vitest";
import {
  clampPage,
  effectiveLayout,
  firstVisibleIndex,
  keyToAction,
  pageCount,
  pageOfOffset,
  recomputePage,
  resolveNav,
  swipeAction,
  tapAction,
} from "@/lib/pagination";

describe("pageCount", () => {
  it("derives pages from scrollWidth, page width and gap", () => {
    expect(pageCount({ scrollWidth: 600, pageWidth: 600, gap: 48 })).toBe(1);
    expect(pageCount({ scrollWidth: 600 * 3 + 48 * 2, pageWidth: 600, gap: 48 })).toBe(3);
  });

  it("never returns less than one and tolerates subpixel overflow", () => {
    expect(pageCount({ scrollWidth: 0, pageWidth: 600, gap: 48 })).toBe(1);
    expect(pageCount({ scrollWidth: 600 * 2 + 48 + 0.4, pageWidth: 600, gap: 48 })).toBe(2);
    expect(pageCount({ scrollWidth: 100, pageWidth: 0, gap: 48 })).toBe(1);
  });
});

describe("page position", () => {
  it("clamps into range", () => {
    expect(clampPage(-2, 5)).toBe(0);
    expect(clampPage(9, 5)).toBe(4);
    expect(clampPage(2, 5)).toBe(2);
  });

  it("maps a block offset to its page", () => {
    expect(pageOfOffset(0, 648)).toBe(0);
    expect(pageOfOffset(648, 648)).toBe(1);
    expect(pageOfOffset(1295, 648)).toBe(1);
  });

  it("finds the first block that starts on or after the page", () => {
    expect(firstVisibleIndex([0, 100, 700, 1400], 1, 648)).toBe(2);
    expect(firstVisibleIndex([0, 100], 1, 648)).toBe(-1);
  });
});

describe("recomputePage", () => {
  it("keeps the anchor block on screen when page count changes", () => {
    expect(recomputePage({ anchorOffset: 1400, step: 648, count: 6, page: 2 })).toBe(2);
    expect(recomputePage({ anchorOffset: 1400, step: 400, count: 9, page: 2 })).toBe(3);
  });

  it("falls back to the clamped page without an anchor", () => {
    expect(recomputePage({ anchorOffset: null, step: 648, count: 2, page: 5 })).toBe(1);
  });
});

describe("keyToAction", () => {
  it("maps reading keys", () => {
    expect(keyToAction({ key: "ArrowRight" })).toBe("next");
    expect(keyToAction({ key: "PageDown" })).toBe("next");
    expect(keyToAction({ key: " " })).toBe("next");
    expect(keyToAction({ key: "ArrowLeft" })).toBe("prev");
    expect(keyToAction({ key: "PageUp" })).toBe("prev");
    expect(keyToAction({ key: " ", shiftKey: true })).toBe("prev");
    expect(keyToAction({ key: "a" })).toBeNull();
  });

  it("ignores keys with modifiers", () => {
    expect(keyToAction({ key: "ArrowRight", metaKey: true })).toBeNull();
    expect(keyToAction({ key: "ArrowRight", altKey: true })).toBeNull();
  });
});

describe("pointer actions", () => {
  it("uses the left and right 30% as tap zones", () => {
    expect(tapAction(100, 1000)).toBe("prev");
    expect(tapAction(299, 1000)).toBe("prev");
    expect(tapAction(500, 1000)).toBeNull();
    expect(tapAction(701, 1000)).toBe("next");
    expect(tapAction(10, 0)).toBeNull();
  });

  it("recognises horizontal swipes only", () => {
    expect(swipeAction(-80, 5)).toBe("next");
    expect(swipeAction(80, 5)).toBe("prev");
    expect(swipeAction(-20, 0)).toBeNull();
    expect(swipeAction(-80, 90)).toBeNull();
  });
});

describe("resolveNav", () => {
  const edge = { hasPrev: true, hasNext: true };

  it("turns pages inside a chapter", () => {
    expect(resolveNav("next", { page: 1, count: 4, ...edge })).toEqual({ type: "page", page: 2 });
    expect(resolveNav("prev", { page: 1, count: 4, ...edge })).toEqual({ type: "page", page: 0 });
  });

  it("moves to the next chapter's first page from the last page", () => {
    expect(resolveNav("next", { page: 3, count: 4, ...edge })).toEqual({
      type: "chapter",
      direction: "next",
      startAt: "first",
    });
  });

  it("moves to the previous chapter's last page from the first page", () => {
    expect(resolveNav("prev", { page: 0, count: 4, ...edge })).toEqual({
      type: "chapter",
      direction: "prev",
      startAt: "last",
    });
  });

  it("stops at the book's ends", () => {
    expect(resolveNav("next", { page: 0, count: 1, hasPrev: true, hasNext: false })).toEqual({
      type: "none",
    });
    expect(resolveNav("prev", { page: 0, count: 1, hasPrev: false, hasNext: true })).toEqual({
      type: "none",
    });
  });
});

describe("effectiveLayout", () => {
  it("falls back to scroll for side-by-side", () => {
    expect(effectiveLayout("paged", "side-by-side")).toBe("scroll");
    expect(effectiveLayout("paged", "translation")).toBe("paged");
    expect(effectiveLayout("scroll", "interleaved")).toBe("scroll");
  });
});
