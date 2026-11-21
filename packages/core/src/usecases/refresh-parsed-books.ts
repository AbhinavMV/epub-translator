import { PARSER_VERSION, type ParsedBook } from "../domain/book.ts";
import type { EpubParser } from "../ports/epub.ts";
import type {
  BlobStore,
  BookRepository,
  JobRepository,
  TranslationRepository,
} from "../ports/stores.ts";
import { bookBlobKey } from "./import-book.ts";

export interface RefreshParsedBooksDeps {
  books: BookRepository;
  blobs: BlobStore;
  parser: EpubParser;
  jobs: JobRepository;
  translations: TranslationRepository;
}

async function dropOrphanedTranslations(
  deps: RefreshParsedBooksDeps,
  bookId: string,
  parsed: ParsedBook,
): Promise<void> {
  const current = new Set(parsed.segments.map((s) => s.id));
  for (const job of await deps.jobs.listByBook(bookId)) {
    const statuses = await deps.translations.statusesForJob(job.id);
    const orphaned = [...statuses.keys()].filter((id) => !current.has(id));
    if (orphaned.length > 0) await deps.translations.deleteMany(job.id, orphaned);
  }
}

export async function refreshParsedBooks(
  deps: RefreshParsedBooksDeps,
): Promise<{ upgraded: number; failed: number }> {
  let upgraded = 0;
  let failed = 0;
  for (const book of await deps.books.list()) {
    const current = await deps.books.getParsed(book.id);
    if (!current || (current.parserVersion ?? 1) >= PARSER_VERSION) continue;
    try {
      const bytes = await deps.blobs.get(bookBlobKey(book.sha256));
      const parsed = await deps.parser.parse(bytes);
      await deps.books.updateParsed(book.id, parsed);
      await dropOrphanedTranslations(deps, book.id, parsed);
      upgraded++;
    } catch {
      failed++;
    }
  }
  return { upgraded, failed };
}
