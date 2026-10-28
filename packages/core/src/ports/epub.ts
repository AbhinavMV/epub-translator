import type { ChapterView, ExportLayout, TargetLanguage } from "@et/contracts";
import type { ParsedBook } from "../domain/book.ts";
import type { SegmentTranslation } from "../domain/segment.ts";

export type Translations = ReadonlyMap<string, SegmentTranslation>;

export interface EpubParser {
  /** @throws InvalidEpubError */
  parse(bytes: Uint8Array): Promise<ParsedBook>;
}

export interface EpubAssets {
  /** Returns the entry bytes and media type for an OPF-relative href, or null. */
  read(bytes: Uint8Array, href: string): Promise<{ bytes: Uint8Array; mediaType: string } | null>;
}

export type RenderedChapter = Omit<ChapterView, "part" | "partCount">;

export interface ChapterRenderer {
  render(
    bytes: Uint8Array,
    book: ParsedBook,
    chapterId: string,
    translations: Translations,
    assetUrl: (href: string) => string,
  ): Promise<RenderedChapter>;
}

export interface ExportOptions {
  layout: ExportLayout;
}

export interface EpubExporter {
  export(
    bytes: Uint8Array,
    book: ParsedBook,
    translations: Translations,
    target: TargetLanguage,
    options: ExportOptions,
  ): Promise<Uint8Array>;
}
