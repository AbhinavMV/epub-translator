import type { BookSummary } from "@et/contracts";
import { parseVolumeTitle } from "@et/core";

const volumeOrder = (book: BookSummary) => book.volumeNumber ?? Number.POSITIVE_INFINITY;

export function translatedProjectName(books: readonly BookSummary[]): string | null {
  const first = books
    .filter((book) => book.translatedTitle?.trim())
    .sort((a, b) => volumeOrder(a) - volumeOrder(b))[0];
  if (!first?.translatedTitle) return null;
  return parseVolumeTitle(first.translatedTitle).seriesTitle || null;
}
