import type { BookDetail, BookSummary, ChapterSummary } from "@et/contracts";
import { type ParsedBook, type StoredBook, stripTokens } from "@et/core";

export function bookSummary(book: StoredBook, parsed: ParsedBook): BookSummary {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    sourceLang: book.sourceLang,
    coverUrl: book.coverHref ? `/api/books/${book.id}/cover` : null,
    chapterCount: parsed.chapters.length,
    segmentCount: parsed.segments.length,
    createdAt: book.createdAt,
  };
}

export function chapterSummaries(parsed: ParsedBook): ChapterSummary[] {
  return parsed.chapters.map((chapter) => {
    const segments = parsed.segments.filter((s) => s.chapterId === chapter.id);
    return {
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
      segmentCount: segments.length,
      charCount: segments.reduce((n, s) => n + stripTokens(s.sourceText).length, 0),
    };
  });
}

export function bookDetail(
  book: StoredBook,
  parsed: ParsedBook,
  settings: BookDetail["settings"],
): BookDetail {
  return { ...bookSummary(book, parsed), chapters: chapterSummaries(parsed), settings };
}

export function assetUrl(bookId: string): (href: string) => string {
  return (href) =>
    `/api/books/${bookId}/assets/${href.split("/").map(encodeURIComponent).join("/")}`;
}
