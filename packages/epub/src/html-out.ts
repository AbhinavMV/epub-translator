import { resolveHref } from "./hrefs.ts";
import { serializeXml, XLINK_NS } from "./xml.ts";

const EXPANDED_WHEN_EMPTY = [
  "a",
  "span",
  "p",
  "div",
  "em",
  "strong",
  "i",
  "b",
  "u",
  "s",
  "small",
  "sup",
  "sub",
  "ruby",
  "rt",
  "rp",
  "li",
  "ul",
  "ol",
  "td",
  "th",
  "tr",
  "table",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "cite",
  "q",
  "figure",
  "figcaption",
  "section",
  "aside",
];

const EMPTY_TAG = new RegExp(`<(${EXPANDED_WHEN_EMPTY.join("|")})((?:\\s[^<>]*?)?)/>`, "g");

/** XHTML serialization re-shaped so the browser's HTML parser reads it the same way. */
export function htmlOf(el: Element): string {
  return serializeXml(el)
    .replace(/\sxmlns(?::\w+)?="[^"]*"/g, "")
    .replace(EMPTY_TAG, "<$1$2></$1>");
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

function rewrite(el: Element, attr: string, docHref: string, assetUrl: (href: string) => string) {
  const value = el.getAttribute(attr);
  if (value && !EXTERNAL.test(value)) el.setAttribute(attr, assetUrl(resolveHref(docHref, value)));
}

/** Mutates `root`; callers pass a clone. */
export function rewriteAssets(
  root: Element,
  docHref: string,
  assetUrl: (href: string) => string,
): void {
  const name = (root.localName ?? root.tagName).toLowerCase();
  if (name === "img") rewrite(root, "src", docHref, assetUrl);
  if (name === "image") {
    if (root.hasAttributeNS(XLINK_NS, "href")) {
      const value = root.getAttributeNS(XLINK_NS, "href") ?? "";
      if (!EXTERNAL.test(value)) {
        root.setAttributeNS(XLINK_NS, "xlink:href", assetUrl(resolveHref(docHref, value)));
      }
    } else {
      rewrite(root, "href", docHref, assetUrl);
    }
  }
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i] as Node;
    if (child.nodeType === 1) rewriteAssets(child as Element, docHref, assetUrl);
  }
}

const STATIC_CONTENT = new Set(["img", "svg", "image", "hr", "video", "audio", "canvas", "math"]);

export function hasStaticContent(el: Element): boolean {
  if (STATIC_CONTENT.has((el.localName ?? el.tagName).toLowerCase())) return true;
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as Node;
    if (child.nodeType === 1 && hasStaticContent(child as Element)) return true;
  }
  return false;
}
