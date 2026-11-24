import {
  type BookSummary,
  languageName,
  PREFERRED_TARGET_LANG,
  type ProjectSummary,
} from "@et/contracts";

export interface ProgressStatus {
  text: string;
  ratio: number;
  done: boolean;
}

function withLanguage(text: string, lang: string | null): string {
  return lang && lang !== PREFERRED_TARGET_LANG ? `${text} · ${languageName(lang)}` : text;
}

const volumes = (n: number) => `${n} volume${n === 1 ? "" : "s"}`;

export function projectProgress(
  project: Pick<
    ProjectSummary,
    "volumeCount" | "translatedVolumeCount" | "fullyTranslatedLang" | "mainLang"
  >,
): ProgressStatus {
  const { volumeCount, translatedVolumeCount } = project;
  if (volumeCount === 0) return { text: "No volumes", ratio: 0, done: false };
  if (project.fullyTranslatedLang) {
    return {
      text: withLanguage("Fully translated", project.fullyTranslatedLang),
      ratio: 1,
      done: true,
    };
  }
  if (!project.mainLang)
    return { text: `Not started · ${volumes(volumeCount)}`, ratio: 0, done: false };
  return {
    text: `${translatedVolumeCount} of ${volumeCount} volumes translated`,
    ratio: translatedVolumeCount / volumeCount,
    done: false,
  };
}

/** `mainLang` is the project's main language; the percentage is measured in it. */
export function volumeProgress(
  book: Pick<BookSummary, "translatedPercent">,
  mainLang: string | null,
): ProgressStatus {
  const percent = book.translatedPercent ?? 0;
  if (percent >= 100) return { text: withLanguage("Translated", mainLang), ratio: 1, done: true };
  if (percent <= 0) return { text: "Not started", ratio: 0, done: false };
  const shown = Math.floor(percent);
  return {
    text: shown === 0 ? "Under 1% translated" : `${shown}% translated`,
    ratio: percent / 100,
    done: false,
  };
}
