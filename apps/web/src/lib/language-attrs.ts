import { getTargetLanguage } from "@et/contracts";

export interface LanguageAttrs {
  lang: string;
  dir: "ltr" | "rtl";
}

export function languageAttrs(code: string | null | undefined): LanguageAttrs | undefined {
  if (!code) return undefined;
  try {
    return { lang: code, dir: getTargetLanguage(code).dir };
  } catch {
    return undefined;
  }
}
