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

  it("lists existing glossary entries with their renderings", () => {
    const { system } = buildTermsPrompt(req);
    expect(system).toContain("- 魔王 → Demon King");
    expect(system).toMatch(/do not return these sources again/i);
  });

  it("passes the custom prompt as style instructions that renderings must follow", () => {
    const { system } = buildTermsPrompt({ ...req, instructions: "Keep -san and -sama." });
    expect(system).toContain("Style instructions from the reader: Keep -san and -sama.");
    expect(system).toMatch(/names, honorifics and forms of address/i);
    expect(system).toMatch(/match the style of the renderings already in the glossary/i);
  });

  it("leaves out style instructions when the custom prompt is blank", () => {
    for (const instructions of [undefined, "", "   "]) {
      const { system } = buildTermsPrompt({ ...req, instructions });
      expect(system).not.toMatch(/style instructions/i);
    }
  });
});
