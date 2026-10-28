import type { StoredBook } from "../domain/book.ts";
import type { EpubParser } from "../ports/epub.ts";
import type { BlobStore, BookRepository } from "../ports/stores.ts";
import type { Clock, Hasher, IdGenerator } from "../ports/system.ts";

export interface ImportBookDeps {
  books: BookRepository;
  blobs: BlobStore;
  parser: EpubParser;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
}

export function bookBlobKey(sha256: string): string {
  return `books/${sha256}.epub`;
}

export async function importBook(deps: ImportBookDeps, bytes: Uint8Array): Promise<StoredBook> {
  const sha256 = await deps.hasher.sha256(bytes);
  const existing = await deps.books.findBySha256(sha256);
  if (existing) return existing;

  const parsed = await deps.parser.parse(bytes);
  const book: StoredBook = {
    id: deps.ids.next(),
    sha256,
    title: parsed.title,
    author: parsed.author,
    sourceLang: parsed.sourceLang,
    coverHref: parsed.coverHref,
    createdAt: deps.clock.now().toISOString(),
  };
  await deps.blobs.put(bookBlobKey(sha256), bytes);
  await deps.books.insert(book, parsed);
  return book;
}
