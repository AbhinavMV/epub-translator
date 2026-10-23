import type { BookSettings, Usage } from "@et/contracts";
import type { ParsedBook, StoredBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { SegmentTranslation } from "../domain/segment.ts";

export interface BookRepository {
  insert(book: StoredBook, parsed: ParsedBook): void;
  get(id: string): StoredBook | null;
  findBySha256(sha256: string): StoredBook | null;
  getParsed(id: string): ParsedBook | null;
  list(): StoredBook[];
  delete(id: string): void;
}

export interface BookSettingsRepository {
  get(bookId: string): BookSettings;
  put(bookId: string, settings: BookSettings): void;
}

export interface JobRepository {
  insert(job: Job): void;
  get(id: string): Job | null;
  findByBookAndLang(bookId: string, targetLang: string): Job | null;
  listByBook(bookId: string): Job[];
  update(id: string, patch: Partial<Pick<Job, "error" | "usage">>): void;
  addUsage(id: string, usage: Usage): void;
}

export interface TranslationRepository {
  get(jobId: string, segmentId: string): SegmentTranslation | null;
  forJob(jobId: string): Map<string, SegmentTranslation>;
  put(jobId: string, segmentId: string, translation: SegmentTranslation): void;
  deleteMany(jobId: string, segmentIds: readonly string[]): void;
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
