import type { JobTitles } from "@et/contracts";
import {
  CONTENTS_CHAPTER_ID,
  NCX_SEGMENT_PREFIX,
  OPF_SEGMENT_PREFIX,
  type ParsedBook,
  TITLE_SEGMENT_ID,
} from "../domain/book.ts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { Repositories } from "../ports/stores.ts";
import { stripTokens } from "../translation/placeholders.ts";

const plain = (text: string): string =>
  stripTokens(text)
    .replace(/&(amp|lt|gt);/g, (_, name: string) =>
      name === "amp" ? "&" : name === "lt" ? "<" : ">",
    )
    .trim();

function translatedText(translation: SegmentTranslation | undefined): string | null {
  if (!translation || (translation.status !== "done" && translation.status !== "flagged")) {
    return null;
  }
  return plain(translation.text) || null;
}

function labelQueues(book: ParsedBook, isLabel: (id: string) => boolean) {
  const queues = new Map<string, string[]>();
  for (const s of book.segments) {
    if (s.chapterId !== CONTENTS_CHAPTER_ID || !isLabel(s.id)) continue;
    const key = plain(s.sourceText);
    queues.set(key, [...(queues.get(key) ?? []), s.id]);
  }
  return queues;
}

export function translatedTitles(
  book: ParsedBook,
  translations: ReadonlyMap<string, SegmentTranslation>,
): JobTitles {
  const nav = labelQueues(
    book,
    (id) => !id.startsWith(OPF_SEGMENT_PREFIX) && !id.startsWith(NCX_SEGMENT_PREFIX),
  );
  const ncx = labelQueues(book, (id) => id.startsWith(NCX_SEGMENT_PREFIX));

  const chapters: Record<string, string> = {};
  for (const chapter of book.chapters) {
    if (chapter.id === CONTENTS_CHAPTER_ID) continue;
    const candidates = [nav.get(chapter.title)?.shift(), ncx.get(chapter.title)?.shift()];
    for (const id of candidates) {
      const text = id ? translatedText(translations.get(id)) : null;
      if (text) {
        chapters[chapter.id] = text;
        break;
      }
    }
  }
  return { book: translatedText(translations.get(TITLE_SEGMENT_ID)), chapters };
}

const LIBRARY_TITLE_LANG = "en";

export async function libraryBookTitle(
  repos: Pick<Repositories, "jobs" | "translations">,
  bookId: string,
  book: ParsedBook,
): Promise<string | null> {
  const job = await repos.jobs.findByBookAndLang(bookId, LIBRARY_TITLE_LANG);
  if (!job) return null;
  return translatedTitles(book, await repos.translations.forSegments(job.id, titleSegmentIds(book)))
    .book;
}

export function titleSegmentIds(book: ParsedBook): string[] {
  const ids = new Set(
    book.segments.filter((s) => s.chapterId === CONTENTS_CHAPTER_ID).map((s) => s.id),
  );
  ids.add(TITLE_SEGMENT_ID);
  return [...ids];
}
