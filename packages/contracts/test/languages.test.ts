import { describe, expect, it } from "vitest";
import { getTargetLanguage, TARGET_LANGUAGES, UnknownLanguageError } from "../src/index.ts";

describe("getTargetLanguage", () => {
  it("returns English ltr horizontal", () => {
    expect(getTargetLanguage("en")).toEqual({
      code: "en",
      name: "English",
      dir: "ltr",
      writingMode: "horizontal-tb",
    });
  });

  it("offers right-to-left targets with the right direction", () => {
    expect(getTargetLanguage("ar")).toMatchObject({ dir: "rtl", writingMode: "horizontal-tb" });
    expect(TARGET_LANGUAGES.map((l) => l.code)).toEqual(
      expect.arrayContaining(["en", "es", "fr", "de", "pt-BR", "zh-Hans", "ko", "ar", "hi"]),
    );
  });

  it("throws UnknownLanguageError for unknown codes", () => {
    expect(() => getTargetLanguage("xx")).toThrow(UnknownLanguageError);
  });
});
