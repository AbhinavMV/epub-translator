import type { TargetLanguage } from "@et/contracts";
import type { Clock, EpubExporter, ParsedBook, Translations } from "@et/core";
import { stripTokens } from "@et/segmenter";
import { isUsable } from "./apply-translation.ts";
import { isContentDocument, NCX_SEGMENT_PREFIX, TITLE_SEGMENT_ID } from "./book-layout.ts";
import { readNcxLabels } from "./chapters.ts";
import { loadDocument } from "./doc-blocks.ts";
import {
  applyHorizontalLayout,
  hasTranslation,
  translateContentDocument,
  translateNcx,
} from "./document-export.ts";
import { relativeHref } from "./hrefs.ts";
import { editPackageDocument } from "./opf-export.ts";
import { OVERRIDE_CSS, OVERRIDE_CSS_NAME } from "./override-css.ts";
import { entryPath, loadPackage } from "./package-doc.ts";
import { parseXml, serializeXml } from "./xml.ts";
import { DEFAULT_ZIP_LIMITS, readZip } from "./zip-reader.ts";
import { type OutputEntry, writeEpubZip } from "./zip-writer.ts";

const encode = (text: string) => new TextEncoder().encode(text);

function segmentCounts(book: ParsedBook): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of book.segments) {
    const hash = s.id.lastIndexOf("#");
    const href = s.id.slice(0, hash);
    counts.set(href, Math.max(counts.get(href) ?? 0, s.ordinal + 1));
  }
  return counts;
}

export class YazlEpubExporter implements EpubExporter {
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  async export(
    bytes: Uint8Array,
    book: ParsedBook,
    translations: Translations,
    target: TargetLanguage,
  ): Promise<Uint8Array> {
    const entries = await readZip(bytes, DEFAULT_ZIP_LIMITS);
    const pkg = loadPackage(entries);
    const counts = segmentCounts(book);
    const replaced = new Map<string, Uint8Array>();

    const cssPath = entryPath(pkg, OVERRIDE_CSS_NAME);

    const translate = (href: string, isNav: boolean) => {
      const count = counts.get(href) ?? 0;
      if (count === 0 && (isNav || target.writingMode !== "horizontal-tb")) return;
      const path = entryPath(pkg, href);
      const doc = loadDocument(entries, pkg, href);
      const css = relativeHref(path, cssPath);
      if (count > 0 && hasTranslation(href, count, translations)) {
        translateContentDocument(doc, href, isNav, translations, target, css);
      } else {
        applyHorizontalLayout(doc, css);
      }
      replaced.set(path, encode(serializeXml(doc)));
    };

    for (const chapter of book.chapters) {
      for (const href of chapter.docHrefs) {
        if (href === pkg.nav?.href) translate(href, true);
        else if (isContentDocument(pkg, href)) translate(href, false);
      }
    }

    if (pkg.ncx) {
      const path = entryPath(pkg, pkg.ncx.href);
      const ncx = parseXml(entries.get(path) ?? new Uint8Array(), pkg.ncx.href);
      translateNcx(ncx, readNcxLabels(ncx), translations, NCX_SEGMENT_PREFIX, TITLE_SEGMENT_ID);
      replaced.set(path, encode(serializeXml(ncx)));
    }

    const titleTranslation = translations.get(TITLE_SEGMENT_ID);
    editPackageDocument(pkg, {
      target,
      modified: this.clock.now(),
      title: isUsable(titleTranslation) ? stripTokens(titleTranslation.text) : null,
      cssPath: OVERRIDE_CSS_NAME,
    });
    replaced.set(pkg.opfPath, encode(serializeXml(pkg.doc)));

    const output: OutputEntry[] = [...entries].map(([name, data]) => ({
      name,
      data: replaced.get(name) ?? data,
    }));
    output.push({ name: cssPath, data: encode(OVERRIDE_CSS) });
    return writeEpubZip(output, this.clock.now());
  }
}
