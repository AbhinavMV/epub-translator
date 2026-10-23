import {
  CONTENTS_CHAPTER_ID,
  NCX_SEGMENT_PREFIX,
  PARSER_VERSION,
  type ParsedBook,
  type ParsedChapter,
  type ParsedSegment,
  TITLE_SEGMENT_ID,
} from "@et/core";
import { encodeBlock, escapeText } from "@et/segmenter";
import {
  FRONT_MATTER_TITLE,
  groupChapters,
  readNavToc,
  readNcxLabels,
  readNcxToc,
  type TocEntry,
} from "./chapters.ts";
import { documentBlocks, loadDocument, segmentId } from "./doc-blocks.ts";
import { metadataFields } from "./metadata-fields.ts";
import { entryPath, type PackageDoc, XHTML_MEDIA_TYPE } from "./package-doc.ts";
import { normalizedText, parseXml } from "./xml.ts";
import type { ZipEntries } from "./zip-reader.ts";

export { CONTENTS_CHAPTER_ID, NCX_SEGMENT_PREFIX, TITLE_SEGMENT_ID };
export const CONTENTS_CHAPTER_TITLE = "Contents";

export function isContentDocument(pkg: PackageDoc, href: string): boolean {
  const item = [...pkg.manifest.values()].find((i) => i.href === href);
  return item?.mediaType === XHTML_MEDIA_TYPE;
}

export function buildBook(entries: ZipEntries, pkg: PackageDoc): ParsedBook {
  const navHref = pkg.nav?.href ?? null;
  const spineHrefs = pkg.spine.map((i) => i.href).filter((h) => h !== navHref);

  const toc: TocEntry[] = [];
  const navDoc = navHref ? loadDocument(entries, pkg, navHref) : null;
  if (navDoc && navHref) toc.push(...readNavToc(navDoc, navHref));
  const ncxDoc = pkg.ncx
    ? parseXml(entries.get(entryPath(pkg, pkg.ncx.href)) ?? new Uint8Array(), pkg.ncx.href)
    : null;
  if (toc.length === 0 && ncxDoc && pkg.ncx) toc.push(...readNcxToc(ncxDoc, pkg.ncx.href));

  const chapters: ParsedChapter[] = [];
  const segments: ParsedSegment[] = [];
  groupChapters(spineHrefs, toc, pkg.title).forEach((group, index) => {
    const chapter: ParsedChapter = {
      id: `ch-${index}`,
      index,
      title: group.title,
      docHrefs: group.docHrefs,
    };
    chapters.push(chapter);
    for (const href of group.docHrefs) {
      if (!isContentDocument(pkg, href)) continue;
      documentBlocks(loadDocument(entries, pkg, href), false).forEach((block, ordinal) => {
        segments.push({
          id: segmentId(href, ordinal),
          chapterId: chapter.id,
          ordinal,
          sourceText: encodeBlock(block).text,
        });
      });
    }
  });

  const contentsDocHrefs: string[] = [];
  const contents: ParsedSegment[] = [
    {
      id: TITLE_SEGMENT_ID,
      chapterId: CONTENTS_CHAPTER_ID,
      ordinal: 0,
      sourceText: escapeText(pkg.title),
    },
  ];
  for (const field of metadataFields(pkg.doc.documentElement)) {
    contents.push({
      id: field.segmentId,
      chapterId: CONTENTS_CHAPTER_ID,
      ordinal: contents.length,
      sourceText: escapeText(normalizedText(field.element)),
    });
  }
  if (navDoc && navHref) {
    contentsDocHrefs.push(navHref);
    documentBlocks(navDoc, true).forEach((block, ordinal) => {
      contents.push({
        id: segmentId(navHref, ordinal),
        chapterId: CONTENTS_CHAPTER_ID,
        ordinal,
        sourceText: encodeBlock(block).text,
      });
    });
  }
  if (ncxDoc && pkg.ncx) {
    contentsDocHrefs.push(pkg.ncx.href);
    readNcxLabels(ncxDoc).forEach((label, ordinal) => {
      contents.push({
        id: `${NCX_SEGMENT_PREFIX}${ordinal}`,
        chapterId: CONTENTS_CHAPTER_ID,
        ordinal,
        sourceText: escapeText(normalizedText(label)),
      });
    });
  }
  chapters.push({
    id: CONTENTS_CHAPTER_ID,
    index: -1,
    title: CONTENTS_CHAPTER_TITLE,
    docHrefs: contentsDocHrefs,
  });
  segments.push(...contents);

  return {
    parserVersion: PARSER_VERSION,
    title: pkg.title,
    author: pkg.author,
    sourceLang: pkg.sourceLang,
    coverHref: pkg.coverHref,
    chapters,
    segments,
  };
}

export { FRONT_MATTER_TITLE };
