import type { ChapterView } from "@et/contracts";
import { NotFoundError } from "../domain/errors.ts";
import type { ChapterRenderer } from "../ports/epub.ts";
import type { BlobStore, BookRepository, TranslationRepository } from "../ports/stores.ts";
import { CHAPTER_PART_BYTES, paginateBlocks } from "./chapter-parts.ts";
import { loadBookBytes, requireBook } from "./load-book.ts";

export interface RenderChapterDeps {
  books: BookRepository;
  blobs: BlobStore;
  translations: TranslationRepository;
  renderer: ChapterRenderer;
}

export interface RenderChapterInput {
  bookId: string;
  jobId: string | null;
  chapterId: string;
  part?: number;
  partBytes?: number;
  assetUrl: (href: string) => string;
}

export async function renderChapter(
  deps: RenderChapterDeps,
  input: RenderChapterInput,
): Promise<ChapterView> {
  const { book, parsed } = await requireBook(deps.books, input.bookId);
  if (!parsed.chapters.some((c) => c.id === input.chapterId)) {
    throw new NotFoundError("Chapter", input.chapterId);
  }
  const bytes = await loadBookBytes(deps.blobs, book);
  const ids = parsed.segments.filter((s) => s.chapterId === input.chapterId).map((s) => s.id);
  const translations = input.jobId
    ? await deps.translations.forSegments(input.jobId, ids)
    : new Map();
  const whole = await deps.renderer.render(
    bytes,
    parsed,
    input.chapterId,
    translations,
    input.assetUrl,
  );
  const parts = paginateBlocks(whole.blocks, input.partBytes ?? CHAPTER_PART_BYTES);
  const part = input.part ?? 0;
  const blocks = parts[part];
  if (!blocks) throw new NotFoundError("Chapter part", String(part));
  return { ...whole, part, partCount: parts.length, blocks };
}
