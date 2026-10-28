import type { ChapterBlock } from "@et/contracts";
import {
  type ChapterRenderer,
  NotFoundError,
  type ParsedBook,
  type ParsedChapter,
  type RenderedChapter,
  type Translations,
} from "@et/core";
import { escapeText, stripTokens } from "@et/segmenter";
import { applyTranslation, isUsable } from "./apply-translation.ts";
import { CONTENTS_CHAPTER_ID, isContentDocument } from "./book-layout.ts";
import { bodyOf, documentBlocks, loadDocument, segmentId } from "./doc-blocks.ts";
import { hasStaticContent, htmlOf, rewriteAssets } from "./html-out.ts";
import { openPackage } from "./package-doc.ts";
import { DEFAULT_ZIP_LIMITS, isMarkupEntry } from "./zip-reader.ts";

type AssetUrl = (href: string) => string;

function segmentBlock(
  block: Element,
  id: string,
  docHref: string,
  translations: Translations,
  assetUrl: AssetUrl,
): ChapterBlock {
  const translation = translations.get(id);
  const source = block.cloneNode(true) as Element;
  rewriteAssets(source, docHref, assetUrl);
  let targetHtml: string | null = null;
  if (isUsable(translation)) {
    const target = block.cloneNode(true) as Element;
    applyTranslation(target, translation);
    rewriteAssets(target, docHref, assetUrl);
    targetHtml = htmlOf(target);
  }
  return {
    kind: "segment",
    id,
    sourceHtml: htmlOf(source),
    targetHtml,
    status: translation?.status ?? "pending",
    ...(translation?.note ? { note: translation.note } : {}),
  };
}

function walk(
  el: Element,
  ordinals: Map<Element, number>,
  docHref: string,
  translations: Translations,
  assetUrl: AssetUrl,
): ChapterBlock[] {
  const ordinal = ordinals.get(el);
  if (ordinal !== undefined) {
    return [segmentBlock(el, segmentId(docHref, ordinal), docHref, translations, assetUrl)];
  }
  const nested: ChapterBlock[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i] as Node;
    if (child.nodeType === 1) {
      nested.push(...walk(child as Element, ordinals, docHref, translations, assetUrl));
    }
  }
  if (nested.some((b) => b.kind === "segment")) return nested;
  if (!hasStaticContent(el)) return [];
  const clone = el.cloneNode(true) as Element;
  rewriteAssets(clone, docHref, assetUrl);
  return [{ kind: "static", html: htmlOf(clone) }];
}

function contentsBlocks(book: ParsedBook, translations: Translations): ChapterBlock[] {
  const plain = (text: string) => escapeText(stripTokens(text));
  return book.segments
    .filter((s) => s.chapterId === CONTENTS_CHAPTER_ID)
    .map((s) => {
      const t = translations.get(s.id);
      return {
        kind: "segment" as const,
        id: s.id,
        sourceHtml: plain(s.sourceText),
        targetHtml: isUsable(t) ? plain(t.text) : null,
        status: t?.status ?? ("pending" as const),
        ...(t?.note ? { note: t.note } : {}),
      };
    });
}

export class XmlChapterRenderer implements ChapterRenderer {
  async render(
    bytes: Uint8Array,
    book: ParsedBook,
    chapterId: string,
    translations: Translations,
    assetUrl: AssetUrl,
  ): Promise<RenderedChapter> {
    const position = book.chapters.findIndex((c) => c.id === chapterId);
    const chapter = book.chapters[position] as ParsedChapter | undefined;
    if (!chapter) throw new NotFoundError("Chapter", chapterId);

    const blocks: ChapterBlock[] = [];
    if (chapter.id === CONTENTS_CHAPTER_ID) {
      blocks.push(...contentsBlocks(book, translations));
    } else {
      const { entries, pkg } = await openPackage(bytes, DEFAULT_ZIP_LIMITS, () => isMarkupEntry);
      for (const href of chapter.docHrefs) {
        if (!isContentDocument(pkg, href)) continue;
        const doc = loadDocument(entries, pkg, href);
        const ordinals = new Map(documentBlocks(doc, false).map((b, i) => [b, i]));
        blocks.push(...walk(bodyOf(doc), ordinals, href, translations, assetUrl));
      }
    }

    return {
      chapterId: chapter.id,
      index: chapter.index,
      title: chapter.title,
      prevChapterId: book.chapters[position - 1]?.id ?? null,
      nextChapterId: book.chapters[position + 1]?.id ?? null,
      blocks,
    };
  }
}
