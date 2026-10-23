export interface TargetLanguage {
  code: string;
  name: string;
  dir: "ltr" | "rtl";
  writingMode: "horizontal-tb" | "vertical-rl";
}

export const TARGET_LANGUAGES: readonly TargetLanguage[] = [
  { code: "en", name: "English", dir: "ltr", writingMode: "horizontal-tb" },
];

export class UnknownLanguageError extends Error {
  constructor(readonly code: string) {
    super(`Unknown target language: ${code}`);
    this.name = "UnknownLanguageError";
  }
}

export function getTargetLanguage(code: string): TargetLanguage {
  const lang = TARGET_LANGUAGES.find((l) => l.code === code);
  if (!lang) throw new UnknownLanguageError(code);
  return lang;
}

const SOURCE_LANGUAGE_NAMES: Record<string, string> = {
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
};

export function languageName(code: string | null): string {
  if (!code) return "the source language";
  const base = code.toLowerCase().split("-")[0] ?? code;
  return SOURCE_LANGUAGE_NAMES[base] ?? TARGET_LANGUAGES.find((l) => l.code === base)?.name ?? code;
}
