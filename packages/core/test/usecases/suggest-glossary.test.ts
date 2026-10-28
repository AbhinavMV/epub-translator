import { describe, expect, it } from "vitest";
import {
  buildSample,
  FatalProviderError,
  suggestGlossary,
  type TermExtractionRequest,
  type TermExtractionResult,
  type TermExtractor,
} from "../../src/index.ts";
import { MemoryBooks, MemoryJobs, MemorySettings, sampleParsed } from "./fakes.ts";

class StubExtractor implements TermExtractor {
  last: TermExtractionRequest | null = null;
  constructor(private readonly result: TermExtractionResult) {}
  async extractTerms(req: TermExtractionRequest) {
    this.last = req;
    return this.result;
  }
}

const usage = { inputTokens: 10, outputTokens: 5 };
const signal = new AbortController().signal;

async function setup(extractor: TermExtractor, withJob = true) {
  const books = new MemoryBooks();
  await books.insert(
    {
      id: "b1",
      sha256: "s",
      title: "本",
      author: null,
      sourceLang: "ja",
      coverHref: null,
      createdAt: "",
    },
    sampleParsed,
  );
  const settings = new MemorySettings();
  const jobs = new MemoryJobs();
  if (withJob) {
    await jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "",
    });
  }
  return { deps: { books, settings, jobs, extractor }, jobs, settings };
}

const input = {
  bookId: "b1",
  model: "m",
  targetLang: "en",
};

describe("suggestGlossary", () => {
  it("drops terms already in the glossary and duplicates", async () => {
    const extractor = new StubExtractor({
      kind: "ok",
      usage,
      terms: [
        { source: "A", target: "a" },
        { source: "B", target: "b" },
        { source: "B", target: "b2" },
        { source: "C", target: "c" },
      ],
    });
    const { deps, settings } = await setup(extractor);
    await settings.put("b1", {
      customPrompt: "",
      glossary: [{ source: "A", target: "x" }],
      provider: null,
      model: null,
    });

    const out = await suggestGlossary(deps, input, signal);

    expect(out.terms.map((t) => t.source)).toEqual(["B", "C"]);
    expect(extractor.last?.existing).toEqual([{ source: "A", target: "x" }]);
  });

  it("caps suggestions at the maximum", async () => {
    const terms = Array.from({ length: 100 }, (_, i) => ({ source: `s${i}`, target: "t" }));
    const { deps } = await setup(new StubExtractor({ kind: "ok", usage, terms }));
    const out = await suggestGlossary(deps, input, signal);
    expect(out.terms).toHaveLength(60);
  });

  it("records usage on the existing workspace job", async () => {
    const { deps, jobs } = await setup(new StubExtractor({ kind: "ok", usage, terms: [] }));
    const out = await suggestGlossary(deps, input, signal);
    expect((await jobs.get("j1"))?.usage).toEqual(usage);
    expect(out.usage).toEqual(usage);
  });

  it("succeeds without a workspace job", async () => {
    const { deps, jobs } = await setup(new StubExtractor({ kind: "ok", usage, terms: [] }), false);
    await suggestGlossary(deps, input, signal);
    expect(jobs.rows.size).toBe(0);
  });

  it("throws a typed error when the extractor fails", async () => {
    const { deps } = await setup(new StubExtractor({ kind: "fatal", cause: "boom" }));
    await expect(suggestGlossary(deps, input, signal)).rejects.toBeInstanceOf(FatalProviderError);
  });
});

describe("buildSample", () => {
  const book = {
    ...sampleParsed,
    segments: [
      { id: "opf#title", chapterId: "", ordinal: 0, sourceText: "書名" },
      ...Array.from({ length: 200 }, (_, i) => ({
        id: `a.xhtml#${i}`,
        chapterId: "ch-0",
        ordinal: i,
        sourceText: `<1>段落${i}</1>です<x2/>`,
      })),
    ],
  };

  it("strips placeholder tokens and includes chapter titles and nav labels", () => {
    const sample = buildSample(book, 12_000);
    expect(sample).not.toMatch(/<\/?\d+>|<x\d+\/>/);
    expect(sample).toContain("第一章");
    expect(sample).toContain("書名");
  });

  it("stays within the cap and spreads across the whole book", () => {
    const sample = buildSample(book, 600);
    expect(sample.length).toBeLessThanOrEqual(600);
    expect(sample).toContain("段落0");
    expect(sample).toMatch(/段落1[5-9]\d/);
  });
});
