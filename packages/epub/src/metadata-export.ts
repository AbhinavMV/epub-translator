import type { TargetLanguage } from "@et/contracts";
import { type ExportOptions, TITLE_SEGMENT_ID, type Translations } from "@et/core";
import { stripTokens } from "@et/segmenter";
import { isUsable } from "./apply-translation.ts";
import { type MetadataField, metadataFields } from "./metadata-fields.ts";
import { setText } from "./opf-export.ts";
import type { PackageDoc } from "./package-doc.ts";
import { descendants } from "./xml.ts";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

type Layout = ExportOptions["layout"];

export function translatedTitle(translations: Translations): string | null {
  const translation = translations.get(TITLE_SEGMENT_ID);
  if (!isUsable(translation)) return null;
  const text = stripTokens(translation.text).trim();
  return text === "" ? null : text;
}

export function displayTitle(
  source: string,
  translated: string | null,
  layout: Layout,
): string | null {
  if (translated === null) return null;
  return layout === "bilingual" ? `${source} / ${translated}` : translated;
}

function allIds(root: Element): Set<string> {
  const ids = new Set<string>();
  const walk = (node: Node) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i] as Node;
      if (child.nodeType !== 1) continue;
      const id = (child as Element).getAttribute("id");
      if (id) ids.add(id);
      walk(child);
    }
  };
  walk(root);
  return ids;
}

function sameTag(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

// file-as is a sort key in the source script; a stale one would sort the translated
// name by its original reading, so it is dropped rather than guessed.
export function applyMetadataTranslations(
  pkg: PackageDoc,
  translations: Translations,
  target: TargetLanguage,
  layout: Layout,
): void {
  const root = pkg.doc.documentElement;
  const metadata = descendants(root, "metadata")[0];
  if (!metadata) return;
  const bilingual = layout === "bilingual";
  const epub3 = (root.getAttribute("version") ?? "").startsWith("3");
  const ids = allIds(root);

  const fields: MetadataField[] = metadataFields(root);
  const title = descendants(metadata, "title")[0];
  if (title) fields.unshift({ segmentId: TITLE_SEGMENT_ID, element: title });

  const ensureId = (field: MetadataField): string => {
    const existing = field.element.getAttribute("id");
    if (existing) return existing;
    const base = `et-${field.segmentId.replace(/^opf#/, "")}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    field.element.setAttribute("id", id);
    return id;
  };

  const fileAsMetas = (id: string): Element[] =>
    descendants(metadata, "meta").filter(
      (m) => m.getAttribute("refines") === `#${id}` && m.getAttribute("property") === "file-as",
    );

  for (const field of fields) {
    const translation = translations.get(field.segmentId);
    if (!isUsable(translation)) continue;
    const translated = stripTokens(translation.text).trim();
    if (translated === "") continue;

    const original = field.element.textContent ?? "";
    const isTitle = field.segmentId === TITLE_SEGMENT_ID;

    if (isTitle) setText(field.element, displayTitle(original, translated, layout) as string);
    else if (!bilingual) setText(field.element, translated);

    if (!bilingual) {
      field.element.removeAttribute("opf:file-as");
      const id = field.element.getAttribute("id");
      if (id) for (const m of fileAsMetas(id)) m.parentNode?.removeChild(m);
    }

    if (!epub3 || (isTitle && bilingual)) continue;
    const lang = bilingual ? target.code : pkg.sourceLang;
    const elementLang = bilingual ? pkg.sourceLang : target.code;
    if (!lang || sameTag(lang, elementLang)) continue;
    const meta = pkg.doc.createElementNS(root.namespaceURI, "meta");
    meta.setAttribute("refines", `#${ensureId(field)}`);
    meta.setAttribute("property", "alternate-script");
    meta.setAttributeNS(XML_NS, "xml:lang", lang);
    setText(meta, bilingual ? translated : original);
    field.element.parentNode?.insertBefore(meta, field.element.nextSibling);
  }
}
