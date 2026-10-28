import { getTargetLanguage } from "@et/contracts";
import type { Job } from "../domain/job.ts";
import type { BookRepository, JobRepository } from "../ports/stores.ts";
import type { Clock, IdGenerator } from "../ports/system.ts";
import { requireBook } from "./load-book.ts";

export interface WorkspaceDeps {
  books: BookRepository;
  jobs: JobRepository;
  ids: IdGenerator;
  clock: Clock;
}

export async function getOrCreateWorkspace(
  deps: WorkspaceDeps,
  bookId: string,
  targetLang: string,
): Promise<Job> {
  const { book } = await requireBook(deps.books, bookId);
  const target = getTargetLanguage(targetLang);
  const existing = await deps.jobs.findByBookAndLang(bookId, target.code);
  if (existing) return existing;
  const job: Job = {
    id: deps.ids.next(),
    bookId,
    targetLang: target.code,
    sourceLang: book.sourceLang,
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: deps.clock.now().toISOString(),
  };
  return deps.jobs.insertIfAbsent(job);
}
