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
  /** `${docHref}#${ordinal}`, or `opf#title` / `ncx#N` for metadata labels. */
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
  title: string;
  author: string | null;
  sourceLang: string | null;
  coverHref: string | null;
  chapters: ParsedChapter[];
  segments: ParsedSegment[];
}
