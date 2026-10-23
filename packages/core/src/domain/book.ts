import { CONTENTS_CHAPTER_ID } from "@et/contracts";

export { CONTENTS_CHAPTER_ID };
export const TITLE_SEGMENT_ID = "opf#title";
export const NCX_SEGMENT_PREFIX = "ncx#";
export const OPF_SEGMENT_PREFIX = "opf#";
export const PARSER_VERSION = 2;

export interface StoredBook {
  id: string;
  sha256: string;
  title: string;
  author: string | null;
  sourceLang: string | null;
  coverHref: string | null;
  createdAt: string;
}

export interface ParsedSegment {
  /** `${docHref}#${ordinal}`, or `opf#…` / `ncx#N` for metadata and navigation labels. */
  id: string;
  chapterId: string;
  ordinal: number;
  /** Tokenized source text: paired `<N>…</N>` and atomic `<xN/>` placeholders. */
  sourceText: string;
}

export interface ParsedChapter {
  id: string;
  index: number;
  title: string;
  docHrefs: string[];
}

export interface ParsedBook {
  /** Absent in books parsed before versioning; read as 1. */
  parserVersion?: number;
  title: string;
  author: string | null;
  sourceLang: string | null;
  coverHref: string | null;
  chapters: ParsedChapter[];
  segments: ParsedSegment[];
}
