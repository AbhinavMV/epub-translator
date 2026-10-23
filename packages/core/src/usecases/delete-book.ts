import type { BlobStore, BookRepository, JobRepository } from "../ports/stores.ts";
import { bookBlobKey } from "./import-book.ts";
import { requireBook } from "./load-book.ts";

export interface DeleteBookDeps {
  books: BookRepository;
  blobs: BlobStore;
  jobs: JobRepository;
  runner: { cancel(jobId: string): void };
}

export async function deleteBook(deps: DeleteBookDeps, bookId: string): Promise<void> {
  const { book } = requireBook(deps.books, bookId);
  for (const job of deps.jobs.listByBook(bookId)) deps.runner.cancel(job.id);
  deps.books.delete(bookId);
  await deps.blobs.delete(bookBlobKey(book.sha256));
}
