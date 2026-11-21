import type { BookSummary } from "@et/contracts";
import { compareVolumes, parseVolumeTitle } from "@et/core";

export function translatedProjectName(books: readonly BookSummary[]): string | null {
  const first = books.filter((book) => book.translatedTitle?.trim()).sort(compareVolumes)[0];
  if (!first?.translatedTitle) return null;
  return parseVolumeTitle(first.translatedTitle).seriesTitle || null;
}
