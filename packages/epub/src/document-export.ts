import type { TargetLanguage } from "@et/contracts";
import type { Translations } from "@et/core";
import { stripTokens } from "@et/segmenter";
import { applyTranslation, isUsable } from "./apply-translation.ts";
import { documentBlocks, segmentId } from "./doc-blocks.ts";
import { setText } from "./opf-export.ts";
import { descendants, XHTML_NS } from "./xml.ts";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

export function hasTranslation(
  docHref: string,
  count: number,
  translations: Translations,
): boolean {
  for (let i = 0; i < count; i++) {
    if (isUsable(translations.get(segmentId(docHref, i)))) return true;
  }
  return false;
}

function dropVerticalClass(el: Element | undefined): void {
  const cls = el?.getAttribute("class");
  if (!el || cls === null || cls === undefined) return;
  const kept = cls.split(/\s+/).filter((c) => c && c !== "vrtl");
  if (kept.length > 0) el.setAttribute("class", kept.join(" "));
  else el.removeAttribute("class");
}

export function translateContentDocument(
  doc: Document,
  docHref: string,
  isNav: boolean,
  translations: Translations,
  target: TargetLanguage,
  cssHref: string,
): void {
  documentBlocks(doc, isNav).forEach((block, ordinal) => {
    const translation = translations.get(segmentId(docHref, ordinal));
    if (isUsable(translation)) applyTranslation(block, translation);
  });

  const root = doc.documentElement;
  root.setAttribute("lang", target.code);
  root.setAttributeNS(XML_NS, "xml:lang", target.code);
  dropVerticalClass(root);
  dropVerticalClass(descendants(root, "body")[0]);

  let head = descendants(root, "head")[0];
  if (!head) {
    head = doc.createElementNS(XHTML_NS, "head");
    root.insertBefore(head, root.firstChild);
  }
  const link = doc.createElementNS(XHTML_NS, "link");
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  link.setAttribute("href", cssHref);
  head.appendChild(link);
}

export function translateNcx(
  doc: Document,
  labels: Element[],
  translations: Translations,
  ncxPrefix: string,
  titleId: string,
): void {
  labels.forEach((label, i) => {
    const translation = translations.get(`${ncxPrefix}${i}`);
    if (isUsable(translation)) setText(label, stripTokens(translation.text));
  });
  const title = translations.get(titleId);
  const docTitle = descendants(doc.documentElement, "docTitle")[0];
  const text = docTitle ? descendants(docTitle, "text")[0] : undefined;
  if (text && isUsable(title)) setText(text, stripTokens(title.text));
}
