import { compareTargetLanguages } from "@et/contracts";
import type { StoredBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { Repositories } from "../ports/stores.ts";

export type FullyTranslatedDeps = Pick<Repositories, "books" | "jobs" | "translations">;

/** Per volume, the target languages it is completely translated into, preferred first. */
export async function completeLanguages(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<string[][]> {
  if (volumes.length === 0) return [];
  const [segmentCounts, jobsPerVolume] = await Promise.all([
    deps.books.segmentCounts(volumes.map((v) => v.id)),
    Promise.all(volumes.map((v) => deps.jobs.listByBook(v.id))),
  ]);
  const isComplete = async (job: Job) => {
    const segments = segmentCounts.get(job.bookId);
    if (segments === undefined) return false;
    return (await deps.translations.translatedCount(job.id)) >= segments;
  };
  return Promise.all(
    jobsPerVolume.map(async (jobs) => {
      const done = await Promise.all(jobs.map(isComplete));
      return jobs
        .filter((_, i) => done[i])
        .map((j) => j.targetLang)
        .sort(compareTargetLanguages);
    }),
  );
}

export function commonLanguage(perVolume: readonly string[][]): string | null {
  const [first = []] = perVolume;
  return first.find((lang) => perVolume.every((langs) => langs.includes(lang))) ?? null;
}

export async function fullyTranslatedLanguage(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<string | null> {
  return commonLanguage(await completeLanguages(deps, volumes));
}
