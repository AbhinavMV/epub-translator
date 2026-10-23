import type { BlobStore, BookRepository } from "../ports/stores.ts";
import { bookBlobKey } from "./import-book.ts";
import { requireBook } from "./load-book.ts";

export async function deleteBook(
  deps: { books: BookRepository; blobs: BlobStore },
  bookId: string,
): Promise<void> {
  const { book } = requireBook(deps.books, bookId);
  deps.books.delete(bookId);
  await deps.blobs.delete(bookBlobKey(book.sha256));
}
