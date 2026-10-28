import type { BlobStore, BookRepository, JobRepository } from "../ports/stores.ts";
import { bookBlobKey } from "./import-book.ts";
import { requireBook } from "./load-book.ts";

export interface DeleteBookDeps {
  books: BookRepository;
  blobs: BlobStore;
  jobs: JobRepository;
  runner: { cancel(jobId: string): Promise<void> };
}

export async function deleteBook(deps: DeleteBookDeps, bookId: string): Promise<void> {
  const { book } = await requireBook(deps.books, bookId);
  for (const job of await deps.jobs.listByBook(bookId)) await deps.runner.cancel(job.id);
  await deps.books.delete(bookId);
  await deps.blobs.delete(bookBlobKey(book.sha256));
}
