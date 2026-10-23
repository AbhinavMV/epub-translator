import { describe, expect, it } from "vitest";
import { getTargetLanguage, UnknownLanguageError } from "../src/index.ts";

describe("getTargetLanguage", () => {
  it("returns English ltr horizontal", () => {
    expect(getTargetLanguage("en")).toEqual({
      code: "en",
      name: "English",
      dir: "ltr",
      writingMode: "horizontal-tb",
    });
  });

  it("throws UnknownLanguageError for unknown codes", () => {
    expect(() => getTargetLanguage("xx")).toThrow(UnknownLanguageError);
  });
});
