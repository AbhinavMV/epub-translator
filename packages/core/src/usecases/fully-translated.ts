import { compareTargetLanguages } from "@et/contracts";
import type { StoredBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { Repositories } from "../ports/stores.ts";

export type FullyTranslatedDeps = Pick<Repositories, "books" | "jobs" | "translations">;

function commonLanguages(jobsPerVolume: Job[][]): string[] {
  const [first = [], ...rest] = jobsPerVolume;
  return first
    .map((j) => j.targetLang)
    .filter((lang) => rest.every((jobs) => jobs.some((j) => j.targetLang === lang)))
    .sort(compareTargetLanguages);
}

export async function fullyTranslatedLanguage(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<string | null> {
  if (volumes.length === 0) return null;
  const [segmentCounts, jobsPerVolume] = await Promise.all([
    deps.books.segmentCounts(volumes.map((v) => v.id)),
    Promise.all(volumes.map((v) => deps.jobs.listByBook(v.id))),
  ]);
  const isComplete = async (job: Job) => {
    const segments = segmentCounts.get(job.bookId);
    if (segments === undefined) return false;
    return (await deps.translations.translatedCount(job.id)) >= segments;
  };
  for (const lang of commonLanguages(jobsPerVolume)) {
    const jobs = jobsPerVolume.map((jobs) => jobs.find((j) => j.targetLang === lang) as Job);
    if ((await Promise.all(jobs.map(isComplete))).every(Boolean)) return lang;
  }
  return null;
}
