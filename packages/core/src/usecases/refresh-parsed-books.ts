import { PARSER_VERSION } from "../domain/book.ts";
import type { EpubParser } from "../ports/epub.ts";
import type { BlobStore, BookRepository } from "../ports/stores.ts";
import { bookBlobKey } from "./import-book.ts";

export interface RefreshParsedBooksDeps {
  books: BookRepository;
  blobs: BlobStore;
  parser: EpubParser;
}

export async function refreshParsedBooks(
  deps: RefreshParsedBooksDeps,
): Promise<{ upgraded: number; failed: number }> {
  let upgraded = 0;
  let failed = 0;
  for (const book of deps.books.list()) {
    const current = deps.books.getParsed(book.id);
    if (!current || (current.parserVersion ?? 1) >= PARSER_VERSION) continue;
    try {
      const bytes = await deps.blobs.get(bookBlobKey(book.sha256));
      deps.books.updateParsed(book.id, await deps.parser.parse(bytes));
      upgraded++;
    } catch {
      failed++;
    }
  }
  return { upgraded, failed };
}
