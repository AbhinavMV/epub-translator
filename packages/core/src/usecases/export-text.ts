import { NotFoundError } from "../domain/errors.ts";
import type { BookRepository, JobRepository, TranslationRepository } from "../ports/stores.ts";
import { stripTokens } from "../translation/placeholders.ts";
import { exportFilename } from "./export-epub.ts";
import { requireBook } from "./load-book.ts";
import { translatedTitles } from "./translated-titles.ts";

export function exportText(
  deps: { books: BookRepository; jobs: JobRepository; translations: TranslationRepository },
  jobId: string,
): { filename: string; text: string } {
  const job = deps.jobs.get(jobId);
  if (!job) throw new NotFoundError("Job", jobId);
  const { book, parsed } = requireBook(deps.books, job.bookId);
  const translations = deps.translations.forJob(jobId);
  const sections: string[] = [];
  for (const chapter of [...parsed.chapters].sort((a, b) => a.index - b.index)) {
    if (chapter.index < 0) continue;
    const paragraphs = parsed.segments
      .filter((s) => s.chapterId === chapter.id)
      .map((s) => translations.get(s.id))
      .filter((t) => t !== undefined && t.status !== "failed")
      .map((t) => stripTokens(t?.text ?? "").trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length > 0) sections.push([chapter.title, ...paragraphs].join("\n\n"));
  }
  const title = translatedTitles(parsed, translations).book;
  if (title) sections.unshift(title);
  return {
    filename: exportFilename(title ?? book.title, job.targetLang, "txt"),
    text: `${sections.join("\n\n\n")}\n`,
  };
}
