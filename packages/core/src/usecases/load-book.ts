import type { ParsedBook, StoredBook } from "../domain/book.ts";
import { NotFoundError } from "../domain/errors.ts";
import type { BlobStore, BookRepository } from "../ports/stores.ts";
import { bookBlobKey } from "./import-book.ts";

export async function requireBook(
  books: BookRepository,
  bookId: string,
): Promise<{ book: StoredBook; parsed: ParsedBook }> {
  const book = await books.get(bookId);
  const parsed = book ? await books.getParsed(bookId) : null;
  if (!book || !parsed) throw new NotFoundError("Book", bookId);
  return { book, parsed };
}

export function loadBookBytes(blobs: BlobStore, book: StoredBook): Promise<Uint8Array> {
  return blobs.get(bookBlobKey(book.sha256));
}
