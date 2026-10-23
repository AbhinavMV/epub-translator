import { InvalidEpubError } from "@et/core";
import { findSegmentBlocks, hasTranslatableText } from "@et/segmenter";
import { entryPath, type PackageDoc, requireEntry } from "./package-doc.ts";
import { descendants, parseXml } from "./xml.ts";
import type { ZipEntries } from "./zip-reader.ts";

export function loadDocument(entries: ZipEntries, pkg: PackageDoc, href: string): Document {
  return parseXml(requireEntry(entries, entryPath(pkg, href)), href, "application/xhtml+xml");
}

export function bodyOf(doc: Document): Element {
  const body = descendants(doc.documentElement, "body")[0];
  if (!body) throw new InvalidEpubError("A content document has no <body>");
  return body;
}

const HEADING = /^h[1-6]$/;

function collectNavLabels(parent: Element, insideItem: boolean, out: Element[]): void {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i] as Node;
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const name = (el.localName ?? el.tagName).toLowerCase();
    if (HEADING.test(name) || (insideItem && (name === "a" || name === "span"))) {
      if (hasTranslatableText(el)) out.push(el);
    } else {
      collectNavLabels(el, insideItem || name === "li", out);
    }
  }
}

export function navLabelBlocks(doc: Document): Element[] {
  const out: Element[] = [];
  for (const nav of descendants(bodyOf(doc), "nav")) collectNavLabels(nav, false, out);
  return out;
}

export function documentBlocks(doc: Document, isNav: boolean): Element[] {
  return isNav ? navLabelBlocks(doc) : findSegmentBlocks(bodyOf(doc));
}

export function segmentId(docHref: string, ordinal: number): string {
  return `${docHref}#${ordinal}`;
}
