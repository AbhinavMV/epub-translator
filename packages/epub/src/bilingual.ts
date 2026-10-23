import type { TargetLanguage } from "@et/contracts";
import type { SegmentTranslation } from "@et/core";
import { applyTranslation } from "./apply-translation.ts";
import { XHTML_NS } from "./xml.ts";

const XML_NS = "http://www.w3.org/XML/1998/namespace";
export const TRANSLATION_CLASS = "et-translation";

// A sibling would add a second list marker, cell, caption or term, which the
// content model (or the reading experience) does not allow.
const HOLDS_COPY_INSIDE = new Set(["li", "dt", "dd", "td", "th", "caption", "figcaption"]);

type Placement = "sibling" | "inside" | "after-run" | "inline";

function placementOf(block: Element, isNav: boolean): Placement {
  if (isNav) return "inline";
  const name = (block.localName ?? block.tagName).toLowerCase();
  if (HOLDS_COPY_INSIDE.has(name)) return "inside";
  if (name === "span") return "after-run";
  return "sibling";
}

function stripIds(el: Element): void {
  el.removeAttribute("id");
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as Node;
    if (child.nodeType === 1) stripIds(child as Element);
  }
}

function markTranslation(el: Element, target: TargetLanguage): void {
  const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  el.setAttribute("class", [...classes, TRANSLATION_CLASS].join(" "));
  el.setAttribute("lang", target.code);
  el.setAttributeNS(XML_NS, "xml:lang", target.code);
  el.setAttribute("dir", target.dir);
}

export function insertBilingualCopy(
  block: Element,
  translation: SegmentTranslation,
  target: TargetLanguage,
  isNav: boolean,
): void {
  const doc = block.ownerDocument;
  const placement = placementOf(block, isNav);
  const copy =
    placement === "sibling"
      ? (block.cloneNode(false) as Element)
      : doc.createElementNS(XHTML_NS, placement === "inline" ? "span" : "div");
  applyTranslation(block, translation, copy);
  stripIds(copy);
  markTranslation(copy, target);

  if (placement === "sibling" || placement === "after-run") {
    block.parentNode?.insertBefore(copy, block.nextSibling);
  } else {
    if (placement === "inline") block.appendChild(doc.createElementNS(XHTML_NS, "br"));
    block.appendChild(copy);
  }
}
