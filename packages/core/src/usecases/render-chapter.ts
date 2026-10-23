import type { ChapterView } from "@et/contracts";
import { NotFoundError } from "../domain/errors.ts";
import type { ChapterRenderer } from "../ports/epub.ts";
import type { BlobStore, BookRepository, TranslationRepository } from "../ports/stores.ts";
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
  assetUrl: (href: string) => string;
}

export async function renderChapter(
  deps: RenderChapterDeps,
  input: RenderChapterInput,
): Promise<ChapterView> {
  const { book, parsed } = requireBook(deps.books, input.bookId);
  if (!parsed.chapters.some((c) => c.id === input.chapterId)) {
    throw new NotFoundError("Chapter", input.chapterId);
  }
  const bytes = await loadBookBytes(deps.blobs, book);
  const translations = input.jobId ? deps.translations.forJob(input.jobId) : new Map();
  return deps.renderer.render(bytes, parsed, input.chapterId, translations, input.assetUrl);
}
