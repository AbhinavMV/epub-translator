import type { BookDetail, BookSummary, ChapterSummary, ProjectSummary } from "@et/contracts";
import { type ParsedBook, type Project, type StoredBook, stripTokens } from "@et/core";

export function bookSummary(
  book: StoredBook,
  parsed: ParsedBook,
  translatedTitle: string | null = null,
): BookSummary {
  return {
    id: book.id,
    title: book.title,
    translatedTitle,
    author: book.author,
    sourceLang: book.sourceLang,
    coverUrl: coverUrl(book),
    chapterCount: parsed.chapters.length,
    segmentCount: parsed.segments.length,
    createdAt: book.createdAt,
    projectId: book.projectId,
    volumeNumber: book.volumeNumber,
  };
}

function coverUrl(book: StoredBook): string | null {
  return book.coverHref ? `/api/books/${book.id}/cover` : null;
}

export function projectSummary(project: Project, books: StoredBook[]): ProjectSummary {
  const first = books[0];
  return {
    ...project,
    volumeCount: books.length,
    coverUrl: first ? coverUrl(first) : null,
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
  translatedTitle: string | null = null,
): BookDetail {
  return {
    ...bookSummary(book, parsed, translatedTitle),
    chapters: chapterSummaries(parsed),
    settings,
  };
}

export function assetUrl(bookId: string): (href: string) => string {
  return (href) =>
    `/api/books/${bookId}/assets/${href.split("/").map(encodeURIComponent).join("/")}`;
}
