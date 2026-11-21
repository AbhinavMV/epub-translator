import { TARGET_LANGUAGES } from "@et/contracts";
import type { StoredBook } from "../domain/book.ts";
import type { Job } from "../domain/job.ts";
import type { Repositories } from "../ports/stores.ts";

type Deps = Pick<Repositories, "books" | "jobs" | "translations">;

const PREFERRED_LANG = "en";

function preference(lang: string): number {
  if (lang === PREFERRED_LANG) return -1;
  const index = TARGET_LANGUAGES.findIndex((l) => l.code === lang);
  return index === -1 ? TARGET_LANGUAGES.length : index;
}

function commonLanguages(jobsPerVolume: Job[][]): string[] {
  const [first = [], ...rest] = jobsPerVolume;
  return first
    .map((j) => j.targetLang)
    .filter((lang) => rest.every((jobs) => jobs.some((j) => j.targetLang === lang)))
    .sort((a, b) => preference(a) - preference(b) || a.localeCompare(b));
}

async function isComplete(deps: Deps, job: Job): Promise<boolean> {
  const parsed = await deps.books.getParsed(job.bookId);
  if (!parsed) return false;
  if ((await deps.translations.translatedCount(job.id)) < parsed.segments.length) return false;
  const statuses = await deps.translations.statusesForJob(job.id);
  return parsed.segments.every((s) => {
    const status = statuses.get(s.id);
    return status === "done" || status === "flagged";
  });
}

export async function fullyTranslatedLanguage(
  deps: Deps,
  volumes: readonly StoredBook[],
): Promise<string | null> {
  if (volumes.length === 0) return null;
  const jobsPerVolume = await Promise.all(volumes.map((v) => deps.jobs.listByBook(v.id)));
  for (const lang of commonLanguages(jobsPerVolume)) {
    if (await everyVolumeComplete(deps, jobsPerVolume, lang)) return lang;
  }
  return null;
}

async function everyVolumeComplete(deps: Deps, jobsPerVolume: Job[][], lang: string) {
  for (const jobs of jobsPerVolume) {
    const job = jobs.find((j) => j.targetLang === lang);
    if (!job || !(await isComplete(deps, job))) return false;
  }
  return true;
}
