import type { BookSettings, ChapterProofread, Usage } from "@et/contracts";
import type { ParsedBook, StoredBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { BatchRepository } from "./batch-repository.ts";

export interface BookRepository {
  insert(book: StoredBook, parsed: ParsedBook): Promise<void>;
  insertIfAbsent(book: StoredBook, parsed: ParsedBook): Promise<StoredBook>;
  get(id: string): Promise<StoredBook | null>;
  findBySha256(sha256: string): Promise<StoredBook | null>;
  getParsed(id: string): Promise<ParsedBook | null>;
  updateParsed(id: string, parsed: ParsedBook): Promise<void>;
  list(): Promise<StoredBook[]>;
  delete(id: string): Promise<void>;
}

export interface BookSettingsRepository {
  get(bookId: string): Promise<BookSettings>;
  put(bookId: string, settings: BookSettings): Promise<void>;
}

export interface JobRepository {
  insert(job: Job): Promise<void>;
  insertIfAbsent(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  findByBookAndLang(bookId: string, targetLang: string): Promise<Job | null>;
  listByBook(bookId: string): Promise<Job[]>;
  update(id: string, patch: Partial<Pick<Job, "error" | "usage">>): Promise<void>;
  addUsage(id: string, usage: Usage): Promise<void>;
}

export interface TranslationRepository {
  get(jobId: string, segmentId: string): Promise<SegmentTranslation | null>;
  forJob(jobId: string): Promise<Map<string, SegmentTranslation>>;
  /** Status only (no text), for progress summaries that run often. */
  statusesForJob(jobId: string): Promise<Map<string, SegmentTranslation["status"]>>;
  forSegments(
    jobId: string,
    segmentIds: readonly string[],
  ): Promise<Map<string, SegmentTranslation>>;
  put(jobId: string, segmentId: string, translation: SegmentTranslation): Promise<void>;
  deleteMany(jobId: string, segmentIds: readonly string[]): Promise<void>;
}

export interface ProofreadRepository {
  get(jobId: string, chapterId: string): Promise<ChapterProofread | null>;
  listForJob(jobId: string): Promise<ChapterProofread[]>;
  put(proofread: ChapterProofread): Promise<void>;
  delete(jobId: string, chapterId: string): Promise<void>;
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export interface Repositories {
  books: BookRepository;
  settings: BookSettingsRepository;
  jobs: JobRepository;
  translations: TranslationRepository;
  batches: BatchRepository;
  proofreads: ProofreadRepository;
}

export interface StoreFactory {
  forOwner(ownerId: string): Repositories;
}
