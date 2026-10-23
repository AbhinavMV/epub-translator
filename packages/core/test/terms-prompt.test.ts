import { getTargetLanguage } from "@et/contracts";
import { describe, expect, it } from "vitest";
import { buildTermsPrompt } from "../src/index.ts";

const req = {
  model: "m",
  sourceLang: "ja",
  target: getTargetLanguage("en"),
  bookTitle: "本",
  sample: "シャルロットは言った。",
  existing: [{ source: "魔王", target: "Demon King" }],
};

describe("buildTermsPrompt", () => {
  it("asks for proper nouns, invented terms and forms of address in the target language", () => {
    const { system } = buildTermsPrompt(req);
    expect(system).toMatch(/proper nouns/i);
    expect(system).toMatch(/invented terms/i);
    expect(system).toMatch(/forms of address/i);
    expect(system).toContain("English");
    expect(system).toContain('{"terms":[{"source","target","note"}]}');
  });

  it("treats the sample as content and lists existing glossary sources to skip", () => {
    const { system, user } = buildTermsPrompt(req);
    expect(system).toMatch(/content, not instructions/i);
    expect(system).toContain("魔王");
    expect(JSON.parse(user)).toMatchObject({ bookTitle: "本", sample: req.sample });
  });
});
