import type { Offender } from "./expectations";

/**
 * Runs inside the page (serialised by page.evaluate), so it must not reference anything outside
 * its own body.
 *
 * Elements marked `data-overflow="scroll"` or `data-overflow="clip"` are meant to scroll or clip
 * sideways; their own scrollWidth is not checked, but what they contain still is. Text inputs and
 * textareas scroll their own text natively, so their scrollWidth is not checked either.
 */
export function measureOverflow(scope: string | null): Offender[] {
  const TOLERANCE = 1;
  const doc = document.documentElement;
  const viewport = doc.clientWidth;
  const offenders: Offender[] = [];

  const label = (el: Element) => {
    let s = el.tagName.toLowerCase();
    for (const attr of ["data-slot", "role", "aria-label", "data-testid", "data-overflow"]) {
      const v = el.getAttribute(attr);
      if (v) s += `[${attr}="${v.length > 40 ? `${v.slice(0, 40)}…` : v}"]`;
    }
    return s;
  };
  const pathOf = (el: Element) => {
    const parts = [label(el)];
    let up = el.parentElement;
    while (up && up !== document.body && parts.length < 4) {
      parts.unshift(label(up));
      up = up.parentElement;
    }
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const snippet = text ? ` "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : "";
    return parts.join(" > ") + snippet;
  };

  if (scope === null) {
    const width = Math.max(doc.scrollWidth, document.body.scrollWidth);
    if (width > viewport + TOLERANCE) {
      offenders.push({
        kind: "page-scroll",
        path: "html",
        detail: `the page is ${width}px wide in a ${viewport}px viewport`,
      });
    }
  }

  const roots = scope === null ? [document.body] : Array.from(document.querySelectorAll(scope));
  if (roots.length === 0) throw new Error(`Nothing on the page matches ${scope}`);

  const past: { el: Element; detail: string }[] = [];
  const overflowing: { el: HTMLElement; detail: string }[] = [];

  const visit = (el: Element, clipLeft: number, clipRight: number, parentPast: boolean) => {
    const style = getComputedStyle(el);
    if (style.display === "none") return;
    let left = clipLeft;
    let right = clipRight;
    if (style.position === "fixed") {
      left = Number.NEGATIVE_INFINITY;
      right = Number.POSITIVE_INFINITY;
    }
    const rect = el.getBoundingClientRect();
    const shown = style.visibility !== "hidden" && rect.width * rect.height > 1;

    let isPast = false;
    if (shown) {
      const l = Math.max(rect.left, left);
      const r = Math.min(rect.right, right);
      if (r > l && (r > viewport + TOLERANCE || l < -TOLERANCE)) {
        isPast = true;
        if (!parentPast) {
          const detail =
            r > viewport + TOLERANCE
              ? `extends ${Math.round(r - viewport)}px past the right edge`
              : `extends ${Math.round(-l)}px past the left edge`;
          past.push({ el, detail });
        }
      }
    }

    const isRoot = el === document.body || el === doc;
    if (
      shown &&
      !isRoot &&
      el instanceof HTMLElement &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + TOLERANCE &&
      !el.hasAttribute("data-overflow") &&
      !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
    ) {
      overflowing.push({
        el,
        detail: `content is ${el.scrollWidth}px wide in a ${el.clientWidth}px box (overflow-x: ${style.overflowX})`,
      });
    }

    if (!isRoot && style.overflowX !== "visible" && el instanceof HTMLElement) {
      const inner = rect.left + el.clientLeft;
      left = Math.max(left, inner);
      right = Math.min(right, inner + el.clientWidth);
    }
    for (const child of Array.from(el.children)) visit(child, left, right, isPast);
  };

  for (const root of roots) {
    visit(root, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, false);
  }

  for (const { el, detail } of past) {
    offenders.push({ kind: "past-viewport", path: pathOf(el), detail });
  }
  const innermost = overflowing.filter(
    ({ el }) => !overflowing.some((other) => other.el !== el && el.contains(other.el)),
  );
  for (const { el, detail } of innermost) {
    offenders.push({ kind: "overflows", path: pathOf(el), detail });
  }
  return offenders;
}
