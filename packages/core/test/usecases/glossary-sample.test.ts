import { describe, expect, it } from "vitest";
import {
  type ParsedBook,
  SampleChunkOutOfRangeError,
  sampleChunk,
  samplePlan,
} from "../../src/index.ts";
import { sampleParsed } from "./fakes.ts";

const paragraph = (i: number) => `段落${String(i).padStart(4, "0")}${"あ".repeat(990)}`;

const longBook: ParsedBook = {
  ...sampleParsed,
  segments: Array.from({ length: 100 }, (_, i) => ({
    id: `a.xhtml#${i}`,
    chapterId: "ch-0",
    ordinal: i,
    sourceText: `<1>${paragraph(i)}</1>`,
  })),
};

describe("sample sizes", () => {
  it("takes about 12,000 characters for a standard sample and 40,000 for a large one", () => {
    const standard = sampleChunk(longBook, "standard", 0);
    const large = sampleChunk(longBook, "large", 0);
    expect(standard.chunks).toBe(1);
    expect(large.chunks).toBe(1);
    expect(standard.sample.length).toBeLessThanOrEqual(12_000);
    expect(standard.sample.length).toBeGreaterThan(9_000);
    expect(large.sample.length).toBeLessThanOrEqual(40_000);
    expect(large.sample.length).toBeGreaterThan(30_000);
  });

  it("splits an entire volume into chunks of about 40,000 characters covering every paragraph once", () => {
    const { chunks } = sampleChunk(longBook, "volume", 0);
    expect(chunks).toBe(3);
    const texts = Array.from({ length: chunks }, (_, i) => sampleChunk(longBook, "volume", i));
    for (const t of texts) {
      expect(t.chunks).toBe(3);
      expect(t.sample.length).toBeLessThanOrEqual(40_000);
      expect(t.sample).not.toMatch(/<\/?\d+>/);
    }
    const all = texts.map((t) => t.sample).join("\n");
    for (let i = 0; i < 100; i++) {
      expect(all.split(paragraph(i)).length - 1).toBe(1);
    }
    expect(texts[0]?.sample).toContain("第一章");
  });

  it("hard-splits a paragraph longer than a chunk", () => {
    const huge: ParsedBook = {
      ...sampleParsed,
      chapters: [],
      segments: [
        { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "字".repeat(90_000) },
      ],
    };
    expect(samplePlan(huge, "volume")).toEqual({ requests: 3, chars: 90_000 });
  });

  it("plans the same requests and characters the chunks contain", () => {
    const plan = samplePlan(longBook, "volume");
    const chars = Array.from(
      { length: plan.requests },
      (_, i) => sampleChunk(longBook, "volume", i).sample.length,
    ).reduce((a, b) => a + b, 0);
    expect(plan).toEqual({ requests: 3, chars });
    expect(samplePlan(longBook, "standard")).toEqual({
      requests: 1,
      chars: sampleChunk(longBook, "standard", 0).sample.length,
    });
  });

  it("treats an empty volume as one request", () => {
    const empty: ParsedBook = { ...sampleParsed, chapters: [], segments: [] };
    expect(samplePlan(empty, "volume")).toEqual({ requests: 1, chars: 0 });
  });

  it("rejects a chunk past the end", () => {
    expect(() => sampleChunk(longBook, "volume", 3)).toThrow(SampleChunkOutOfRangeError);
    expect(() => sampleChunk(longBook, "large", 1)).toThrow(SampleChunkOutOfRangeError);
  });
});
