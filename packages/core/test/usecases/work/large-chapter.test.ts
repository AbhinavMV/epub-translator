import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBatchResult,
  type ParsedBook,
  planBatchUnits,
  recordClientBatch,
  type SegmentTranslation,
} from "../../../src/index.ts";
import { counterIds, fixedClock, type MemoryRepos, MemoryStoreFactory } from "../fakes.ts";

const limits = { maxChars: 100, maxCount: 2, contextSize: 8 };
const usage = { inputTokens: 3, outputTokens: 4 };
const zero = { inputTokens: 0, outputTokens: 0 };
const COUNT = 10;

const book: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: Array.from({ length: COUNT }, (_, i) => ({
    id: `a.xhtml#${i}`,
    chapterId: "ch-0",
    ordinal: i,
    sourceText: `文${i}`,
  })),
};
const ids = book.segments.map((s) => s.id);
const done = (text: string): SegmentTranslation => ({ text, status: "done" });

let repos: MemoryRepos;

beforeEach(async () => {
  repos = new MemoryStoreFactory().local();
  await repos.books.insert(
    {
      id: "b1",
      title: "本",
      author: null,
      sourceLang: "ja",
      sha256: "x",
      coverHref: null,
      createdAt: "t",
    } as never,
    book,
  );
  await repos.jobs.insert({
    id: "j1",
    bookId: "b1",
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: zero,
    createdAt: "t",
  });
  await repos.settings.put("b1", {
    customPrompt: "be terse",
    glossary: [{ source: "一", target: "one" }],
    provider: null,
    model: null,
  });
});

async function open() {
  return recordClientBatch(
    repos,
    { ids: counterIds("b"), clock: fixedClock },
    {
      jobId: "j1",
      chapterId: "ch-0",
      provider: "anthropic",
      model: "m",
      vendorBatchId: "vb",
      segmentIds: [ids],
    },
  );
}

describe("planBatchUnits pages", () => {
  const plan = (offset: number, pageChars: number) =>
    planBatchUnits(repos, { jobId: "j1", chapterId: "ch-0", offset, pageChars, ...limits });

  it("sends the prompt fields once and keeps them out of the units", async () => {
    const page = await plan(0, 1_000_000);
    expect(page.shared).toMatchObject({
      sourceLang: "ja",
      bookTitle: "本",
      instructions: "be terse",
      glossary: [{ source: "一", target: "one" }],
    });
    for (const unit of page.units) {
      expect(Object.keys(unit).sort()).toEqual(["customId", "segments"]);
    }
  });

  it("pages through every unit exactly once and ends with a null cursor", async () => {
    const seen: string[] = [];
    const customIds: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null) {
      const page = await plan(offset, 6);
      pages++;
      for (const unit of page.units) {
        customIds.push(unit.customId);
        seen.push(...unit.segments.map((s) => s.id));
      }
      offset = page.nextOffset;
    }
    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(ids);
    expect(customIds).toEqual(Array.from({ length: customIds.length }, (_, i) => String(i)));
  });

  it("returns an empty final page while a batch is in flight", async () => {
    await open();
    expect(await plan(0, 1_000_000)).toMatchObject({ units: [], nextOffset: null });
  });
});

describe("applyBatchResult chunks", () => {
  const chunk = (batchId: string, from: number, to: number, final: boolean, u = zero) =>
    applyBatchResult(repos, {
      jobId: "j1",
      batchId,
      results: new Map(ids.slice(from, to).map((id) => [id, done(`t-${id}`)])),
      usage: u,
      final,
    });

  it("keeps the batch open until the final chunk", async () => {
    const batch = await open();
    expect(await chunk(batch.id, 0, 5, false)).toMatchObject({ done: 5 });
    expect(await repos.batches.openForChapter("j1", "ch-0")).not.toBeNull();
    expect(await chunk(batch.id, 5, COUNT, true, usage)).toMatchObject({ done: COUNT });
    expect(await repos.batches.openForChapter("j1", "ch-0")).toBeNull();
    expect((await repos.jobs.get("j1"))?.usage).toEqual(usage);
  });

  it("applies a replayed chunk without changing the outcome", async () => {
    const batch = await open();
    await chunk(batch.id, 0, 5, false);
    const again = await chunk(batch.id, 0, 5, false);
    expect(again).toMatchObject({ done: 5 });
    expect(await repos.batches.openForChapter("j1", "ch-0")).not.toBeNull();
    expect((await repos.translations.forJob("j1")).size).toBe(5);
  });

  it("still rejects segments that are not part of the batch", async () => {
    const batch = await open();
    await expect(
      applyBatchResult(repos, {
        jobId: "j1",
        batchId: batch.id,
        results: new Map([["zzz#0", done("x")]]),
        usage: zero,
        final: false,
      }),
    ).rejects.toThrow("not part of this batch");
  });
});
