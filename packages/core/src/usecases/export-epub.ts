import { type ExportLayout, getTargetLanguage } from "@et/contracts";
import { NotFoundError } from "../domain/errors.ts";
import type { EpubExporter } from "../ports/epub.ts";
import type {
  BlobStore,
  BookRepository,
  JobRepository,
  TranslationRepository,
} from "../ports/stores.ts";
import { loadBookBytes, requireBook } from "./load-book.ts";
import { translatedTitles } from "./translated-titles.ts";

export interface ExportEpubDeps {
  books: BookRepository;
  jobs: JobRepository;
  blobs: BlobStore;
  translations: TranslationRepository;
  exporter: EpubExporter;
}

export function exportFilename(
  title: string,
  targetLang: string,
  ext: string,
  layout: ExportLayout = "translation",
): string {
  const safe =
    title
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, "_")
      .trim()
      .slice(0, 150) || "book";
  const suffix = layout === "bilingual" ? `${targetLang}, bilingual` : targetLang;
  return `${safe} (${suffix}).${ext}`;
}

export async function exportEpub(
  deps: ExportEpubDeps,
  jobId: string,
  layout: ExportLayout = "translation",
): Promise<{ filename: string; bytes: Uint8Array }> {
  const job = await deps.jobs.get(jobId);
  if (!job) throw new NotFoundError("Job", jobId);
  const { book, parsed } = await requireBook(deps.books, job.bookId);
  const bytes = await loadBookBytes(deps.blobs, book);
  const translations = await deps.translations.forJob(jobId);
  const out = await deps.exporter.export(
    bytes,
    parsed,
    translations,
    getTargetLanguage(job.targetLang),
    { layout },
  );
  const title = translatedTitles(parsed, translations).book ?? book.title;
  return { filename: exportFilename(title, job.targetLang, "epub", layout), bytes: out };
}
