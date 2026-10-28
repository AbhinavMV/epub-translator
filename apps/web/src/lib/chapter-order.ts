import { type ChapterSummary, CONTENTS_CHAPTER_ID } from "@et/contracts";

export function contentsFirst(chapters: readonly ChapterSummary[]): ChapterSummary[] {
  return [
    ...chapters.filter((c) => c.id === CONTENTS_CHAPTER_ID),
    ...chapters.filter((c) => c.id !== CONTENTS_CHAPTER_ID),
  ];
}
