import type {
  BookSettings,
  ChapterProofread,
  LegacyBookTerms,
  ProjectSettings,
  Usage,
} from "@et/contracts";
import type { ParsedBook, StoredBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { Project } from "../domain/project.ts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { BatchRepository } from "./batch-repository.ts";

export interface BookRepository {
  insert(book: StoredBook, parsed: ParsedBook): Promise<void>;
  insertIfAbsent(book: StoredBook, parsed: ParsedBook): Promise<StoredBook>;
  get(id: string): Promise<StoredBook | null>;
  findBySha256(sha256: string): Promise<StoredBook | null>;
  getParsed(id: string): Promise<ParsedBook | null>;
  updateParsed(id: string, parsed: ParsedBook): Promise<void>;
  /** Stored counts, so a summary need not load parsed books; unknown ids are absent. */
  segmentCounts(ids: readonly string[]): Promise<Map<string, number>>;
  list(): Promise<StoredBook[]>;
  listByProject(projectId: string): Promise<StoredBook[]>;
  place(id: string, projectId: string, volumeNumber: number): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ProjectRepository {
  create(project: Project): Promise<void>;
  get(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
  rename(id: string, name: string): Promise<void>;
  delete(id: string): Promise<void>;
  seriesTitle(id: string): Promise<string | null>;
  /** Records the series only on a project that has none yet; renames never touch it. */
  adoptSeriesTitle(id: string, seriesTitle: string): Promise<void>;
  findBySeriesTitle(seriesTitle: string): Promise<Project | null>;
}

export interface ProjectSettingsRepository {
  get(projectId: string): Promise<ProjectSettings | null>;
  put(projectId: string, settings: ProjectSettings): Promise<void>;
}

export interface BookSettingsRepository {
  get(bookId: string): Promise<BookSettings>;
  /** Keeps any other keys already stored for the book, such as its pre-project terms. */
  put(bookId: string, settings: BookSettings): Promise<void>;
  getLegacyTerms(bookId: string): Promise<LegacyBookTerms | null>;
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
  /** Segments stored as done or flagged, including any the book no longer has. */
  translatedCount(jobId: string): Promise<number>;
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
  projects: ProjectRepository;
  projectSettings: ProjectSettingsRepository;
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
