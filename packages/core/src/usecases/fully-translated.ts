import { compareTargetLanguages } from "@et/contracts";
import type { StoredBook } from "../domain/book.ts";
import type { Repositories } from "../ports/stores.ts";

export type FullyTranslatedDeps = Pick<Repositories, "books" | "jobs" | "translations">;

interface LanguageProgress {
  translated: number;
  complete: boolean;
}

export interface VolumeProgress {
  completeLangs: string[];
  translatedPercent: number | null;
}

export interface ProjectProgress {
  fullyTranslatedLang: string | null;
  mainLang: string | null;
  translatedVolumeCount: number;
  volumes: VolumeProgress[];
}

async function languageProgress(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<{ segments: number | undefined; langs: Map<string, LanguageProgress> }[]> {
  if (volumes.length === 0) return [];
  const [segmentCounts, jobsPerVolume] = await Promise.all([
    deps.books.segmentCounts(volumes.map((v) => v.id)),
    Promise.all(volumes.map((v) => deps.jobs.listByBook(v.id))),
  ]);
  return Promise.all(
    volumes.map(async (volume, i) => {
      const segments = segmentCounts.get(volume.id);
      const jobs = jobsPerVolume[i] ?? [];
      const counts = await Promise.all(jobs.map((j) => deps.translations.translatedCount(j.id)));
      const langs = new Map<string, LanguageProgress>();
      jobs.forEach((job, j) => {
        const translated = counts[j] ?? 0;
        const best = langs.get(job.targetLang);
        if (best && best.translated >= translated) return;
        langs.set(job.targetLang, {
          translated,
          complete: segments !== undefined && translated >= segments,
        });
      });
      return { segments, langs };
    }),
  );
}

function mainLanguage(perVolume: readonly Map<string, LanguageProgress>[]): string | null {
  const tally = new Map<string, { complete: number; started: number }>();
  for (const langs of perVolume) {
    for (const [lang, { translated, complete }] of langs) {
      if (!complete && translated === 0) continue;
      const t = tally.get(lang) ?? { complete: 0, started: 0 };
      tally.set(lang, { complete: t.complete + (complete ? 1 : 0), started: t.started + 1 });
    }
  }
  const [best] = [...tally].sort(
    ([a, x], [b, y]) =>
      y.complete - x.complete || y.started - x.started || compareTargetLanguages(a, b),
  );
  return best?.[0] ?? null;
}

function percent(progress: LanguageProgress | undefined, segments: number | undefined): number {
  if (!progress) return 0;
  if (progress.complete) return 100;
  if (!segments) return 0;
  return Math.min(99, Math.floor((progress.translated * 100) / segments));
}

export async function projectProgress(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<ProjectProgress> {
  const perVolume = await languageProgress(deps, volumes);
  const completeLangs = perVolume.map(({ langs }) =>
    [...langs]
      .filter(([, p]) => p.complete)
      .map(([lang]) => lang)
      .sort(compareTargetLanguages),
  );
  const mainLang = mainLanguage(perVolume.map((v) => v.langs));
  return {
    fullyTranslatedLang: commonLanguage(completeLangs),
    mainLang,
    translatedVolumeCount: mainLang
      ? perVolume.filter((v) => v.langs.get(mainLang)?.complete).length
      : 0,
    volumes: perVolume.map((v, i) => ({
      completeLangs: completeLangs[i] ?? [],
      translatedPercent: mainLang ? percent(v.langs.get(mainLang), v.segments) : null,
    })),
  };
}

/** Per volume, the target languages it is completely translated into, preferred first. */
export async function completeLanguages(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<string[][]> {
  return (await projectProgress(deps, volumes)).volumes.map((v) => v.completeLangs);
}

export function commonLanguage(perVolume: readonly string[][]): string | null {
  const [first = []] = perVolume;
  return first.find((lang) => perVolume.every((langs) => langs.includes(lang))) ?? null;
}

export async function fullyTranslatedLanguage(
  deps: FullyTranslatedDeps,
  volumes: readonly StoredBook[],
): Promise<string | null> {
  return (await projectProgress(deps, volumes)).fullyTranslatedLang;
}
