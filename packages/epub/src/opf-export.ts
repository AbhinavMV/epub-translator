import type { TargetLanguage } from "@et/contracts";
import type { ExportOptions } from "@et/core";
import type { PackageDoc } from "./package-doc.ts";
import { descendants } from "./xml.ts";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

export function setText(el: Element, value: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(el.ownerDocument.createTextNode(value));
}

export function formatModified(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function uniqueId(pkg: PackageDoc, base: string): string {
  let id = base;
  for (let n = 2; pkg.manifest.has(id); n++) id = `${base}-${n}`;
  return id;
}

export interface OpfEdit {
  target: TargetLanguage;
  layout: ExportOptions["layout"];
  modified: Date;
  cssPath: string;
}

export function editPackageDocument(pkg: PackageDoc, edit: OpfEdit): void {
  const doc = pkg.doc;
  const root = doc.documentElement;
  const ns = root.namespaceURI;
  const metadata = descendants(root, "metadata")[0] as Element;

  const bilingual = edit.layout === "bilingual";
  const sourceLang = pkg.sourceLang;

  const language = descendants(metadata, "language")[0];
  if (bilingual) {
    if (
      !descendants(metadata, "language").some((l) => sameLanguage(l.textContent, edit.target.code))
    ) {
      addSecondLanguage(doc, metadata, language, edit.target.code);
    }
  } else {
    root.setAttributeNS(XML_NS, "xml:lang", edit.target.code);
    root.setAttribute("dir", edit.target.dir);
    if (language) setText(language, edit.target.code);
  }

  const modified = descendants(metadata, "meta").find(
    (m) => m.getAttribute("property") === "dcterms:modified",
  );
  if (modified) {
    setText(modified, formatModified(edit.modified));
  } else {
    const meta = doc.createElementNS(ns, "meta");
    meta.setAttribute("property", "dcterms:modified");
    setText(meta, formatModified(edit.modified));
    metadata.appendChild(meta);
  }

  const writingMode = descendants(metadata, "meta").find(
    (m) => m.getAttribute("name") === "primary-writing-mode",
  );
  const spine = descendants(root, "spine")[0];
  const previous = spine?.getAttribute("page-progression-direction") ?? null;
  const direction = bilingual ? bilingualDirection(sourceLang, previous) : edit.target.dir;

  if (writingMode) {
    const current = writingMode.getAttribute("content") ?? "";
    if (!bilingual) writingMode.setAttribute("content", kindleWritingMode(edit.target));
    else if (current.startsWith("vertical")) {
      writingMode.setAttribute("content", direction === "rtl" ? "horizontal-rl" : "horizontal-lr");
    }
  }

  if (spine && direction) {
    if (previous && previous !== direction) mirrorPageSpreads(spine);
    spine.setAttribute("page-progression-direction", direction);
  }

  const manifest = descendants(root, "manifest")[0];
  if (manifest) {
    const item = doc.createElementNS(ns, "item");
    item.setAttribute("id", uniqueId(pkg, "et-override-css"));
    item.setAttribute("href", edit.cssPath);
    item.setAttribute("media-type", "text/css");
    manifest.appendChild(item);
  }
}

const RTL_SCRIPTS = new Set(["ar", "he", "fa", "ur", "yi", "ps", "sd", "ug", "dv"]);

function baseLanguage(code: string | null): string {
  return (code ?? "").trim().toLowerCase().split("-")[0] ?? "";
}

function sameLanguage(a: string | null, b: string): boolean {
  return (a ?? "").trim().toLowerCase() === b.toLowerCase();
}

// A right-to-left spine in a book whose language is not written right to left can only come
// from vertical text, which bilingual output converts to horizontal.
function bilingualDirection(sourceLang: string | null, previous: string | null): string | null {
  if (previous === "rtl" && !RTL_SCRIPTS.has(baseLanguage(sourceLang))) return "ltr";
  return previous;
}

function addSecondLanguage(
  doc: Document,
  metadata: Element,
  first: Element | undefined,
  code: string,
): void {
  const el = doc.createElementNS(first?.namespaceURI ?? null, first?.tagName ?? "dc:language");
  setText(el, code);
  if (first?.parentNode === metadata) metadata.insertBefore(el, first.nextSibling);
  else metadata.appendChild(el);
}

function kindleWritingMode(target: TargetLanguage): string {
  if (target.writingMode === "vertical-rl") return "vertical-rl";
  return target.dir === "rtl" ? "horizontal-rl" : "horizontal-lr";
}

const MIRRORED: Record<string, string> = {
  "page-spread-left": "page-spread-right",
  "page-spread-right": "page-spread-left",
};

function mirrorPageSpreads(spine: Element): void {
  for (const itemref of descendants(spine, "itemref")) {
    const props = itemref.getAttribute("properties");
    if (!props) continue;
    itemref.setAttribute(
      "properties",
      props
        .split(/\s+/)
        .map((p) => MIRRORED[p] ?? p)
        .join(" "),
    );
  }
}
