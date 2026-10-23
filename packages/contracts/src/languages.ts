export interface TargetLanguage {
  code: string;
  name: string;
  dir: "ltr" | "rtl";
  writingMode: "horizontal-tb" | "vertical-rl";
}

export const TARGET_LANGUAGES: readonly TargetLanguage[] = [
  { code: "en", name: "English", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "es", name: "Spanish", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "fr", name: "French", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "de", name: "German", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "it", name: "Italian", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "pt-BR", name: "Brazilian Portuguese", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "ru", name: "Russian", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "zh-Hans", name: "Simplified Chinese", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "ko", name: "Korean", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "id", name: "Indonesian", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "vi", name: "Vietnamese", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "hi", name: "Hindi", dir: "ltr", writingMode: "horizontal-tb" },
  { code: "ar", name: "Arabic", dir: "rtl", writingMode: "horizontal-tb" },
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
