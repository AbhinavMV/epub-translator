import { getTargetLanguage } from "@et/contracts";
import { NotFoundError } from "../domain/errors.ts";
import type { EpubExporter } from "../ports/epub.ts";
import type {
  BlobStore,
  BookRepository,
  JobRepository,
  TranslationRepository,
} from "../ports/stores.ts";
import { loadBookBytes, requireBook } from "./load-book.ts";

export interface ExportEpubDeps {
  books: BookRepository;
  jobs: JobRepository;
  blobs: BlobStore;
  translations: TranslationRepository;
  exporter: EpubExporter;
}

export function exportFilename(title: string, targetLang: string, ext: string): string {
  const safe =
    title
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")
      .trim()
      .slice(0, 150) || "book";
  return `${safe} (${targetLang}).${ext}`;
}

export async function exportEpub(
  deps: ExportEpubDeps,
  jobId: string,
): Promise<{ filename: string; bytes: Uint8Array }> {
  const job = deps.jobs.get(jobId);
  if (!job) throw new NotFoundError("Job", jobId);
  const { book, parsed } = requireBook(deps.books, job.bookId);
  const bytes = await loadBookBytes(deps.blobs, book);
  const out = await deps.exporter.export(
    bytes,
    parsed,
    deps.translations.forJob(jobId),
    getTargetLanguage(job.targetLang),
  );
  return { filename: exportFilename(book.title, job.targetLang, "epub"), bytes: out };
}
