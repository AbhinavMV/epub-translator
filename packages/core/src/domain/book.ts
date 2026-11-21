import { CONTENTS_CHAPTER_ID } from "@et/contracts";
import { UnplacedBookError } from "./errors.ts";

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
  /** Null only on rows from before projects, until backfill:projects places them. */
  projectId: string | null;
  volumeNumber: number | null;
}

export function assertPlaced(book: StoredBook): void {
  if (!book.projectId) throw new UnplacedBookError(book.id);
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
