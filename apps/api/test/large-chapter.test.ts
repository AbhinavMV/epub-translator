import {
  BatchPlanSchema,
  BookSummarySchema,
  type ChapterBlock,
  ChapterProgressSchema,
  ChapterViewSchema,
  JobSummarySchema,
  RecordedBatchSchema,
} from "@et/contracts";
import type { ChapterRenderer, EpubAssets, EpubExporter, EpubParser, ParsedBook } from "@et/core";
import { FakeProvider } from "@et/providers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";
import { LOCAL_PUBLIC_CONFIG } from "../src/http/config.ts";

const SEGMENTS = 1200;
const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: Array.from({ length: SEGMENTS }, (_, i) => ({
    id: `a.xhtml#${i}`,
    chapterId: "ch-0",
    ordinal: i,
    sourceText: "字".repeat(1500),
  })),
};
const ids = parsed.segments.map((s) => s.id);

const BIG_ASSET = new Uint8Array(4 * 1024 * 1024 + 1);
const SMALL_ASSET = new Uint8Array([1, 2, 3]);

const blocks: ChapterBlock[] = Array.from({ length: 60 }, (_, i) => ({
  kind: "segment",
  id: `a.xhtml#${i}`,
  sourceHtml: `<p>${"字".repeat(40_000)}</p>`,
  targetHtml: null,
  status: "pending",
}));

const parser: EpubParser = { parse: async () => parsed };
const assets: EpubAssets = {
  read: async (_bytes, href) =>
    href === "big.png"
      ? { bytes: BIG_ASSET, mediaType: "image/png" }
      : { bytes: SMALL_ASSET, mediaType: "image/png" },
};
const renderer: ChapterRenderer = {
  render: async (_b, _book, chapterId) => ({
    chapterId,
    index: 0,
    title: "",
    prevChapterId: null,
    nextChapterId: null,
    blocks,
  }),
};
const exporter: EpubExporter = { export: async () => new Uint8Array([1]) };

const send = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { "content-type": "application/json" },
});

let app: ReturnType<typeof createApp>;
let jobId: string;
let bookId: string;

beforeEach(async () => {
  const services = createLocalServices({
    dataDir: ":memory:",
    env: {},
    epub: { parser, assets, renderer, exporter },
    fakeProvider: new FakeProvider(),
  });
  app = createApp(services, { config: { ...LOCAL_PUBLIC_CONFIG, clientExecution: true } });
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1])], "book.epub"));
  bookId = BookSummarySchema.parse(
    await (await app.request("/api/books", { method: "POST", body: form })).json(),
  ).id;
  jobId = JobSummarySchema.parse(
    await (await app.request(`/api/books/${bookId}/workspace?targetLang=en`)).json(),
  ).id;
});

describe("chapter parts", () => {
  const part = async (n: number | string) =>
    app.request(`/api/books/${bookId}/chapters/ch-0?jobId=${jobId}&part=${n}`);

  it("serves a chapter over 2 MB as parts under the budget that rejoin exactly", async () => {
    const first = ChapterViewSchema.parse(await (await part(0)).json());
    expect(first.partCount).toBeGreaterThan(1);
    const joined: ChapterBlock[] = [];
    for (let p = 0; p < first.partCount; p++) {
      const res = await part(p);
      const text = await res.text();
      expect(new TextEncoder().encode(text).length).toBeLessThan(1_600_000);
      joined.push(...ChapterViewSchema.parse(JSON.parse(text)).blocks);
    }
    expect(joined).toEqual(blocks);
  });

  it("defaults to the first part and 404s past the last", async () => {
    const view = ChapterViewSchema.parse(
      await (await app.request(`/api/books/${bookId}/chapters/ch-0?jobId=${jobId}`)).json(),
    );
    expect(view.part).toBe(0);
    expect((await part(view.partCount)).status).toBe(404);
    expect((await part("-1")).status).toBe(400);
  });
});

describe("batch plan pages", () => {
  it("keeps every page under 4 MB and covers all segments exactly once", async () => {
    const seen: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null) {
      const res = await app.request(
        `/api/jobs/${jobId}/chapters/ch-0/batch-plan?offset=${offset}`,
        send("POST"),
      );
      const text = await res.text();
      expect(new TextEncoder().encode(text).length).toBeLessThan(4 * 1024 * 1024);
      const page = BatchPlanSchema.parse(JSON.parse(text));
      for (const unit of page.units) seen.push(...unit.segments.map((s) => s.id));
      offset = page.nextOffset;
      pages++;
    }
    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(ids);
  });
});

describe("batch result chunks", () => {
  const segmentsOf = (from: number, to: number) =>
    ids.slice(from, to).map((id) => ({ id, text: "x", status: "done" as const }));
  const post = (batchId: string, body: unknown) =>
    app.request(`/api/jobs/${jobId}/batches/${batchId}/results`, send("POST", body));
  const usage = { inputTokens: 0, outputTokens: 0 };

  async function record() {
    const res = await app.request(
      `/api/jobs/${jobId}/batches`,
      send("POST", {
        chapterId: "ch-0",
        provider: "anthropic",
        model: "m",
        vendorBatchId: "vb",
        segmentIds: [ids.slice(0, 500), ids.slice(500, 1000), ids.slice(1000)],
      }),
    );
    return RecordedBatchSchema.parse(await res.json());
  }
  const openCount = async () =>
    ((await (await app.request(`/api/jobs/${jobId}/batches`)).json()) as unknown[]).length;

  it("applies chunks past the old 5000 cap's single-request size and closes only on final", async () => {
    const batch = await record();
    const a = await post(batch.id, { segments: segmentsOf(0, 1000), usage, final: false });
    expect(ChapterProgressSchema.parse(await a.json())).toMatchObject({ done: 1000 });
    expect(await openCount()).toBe(1);

    const replay = await post(batch.id, { segments: segmentsOf(0, 1000), usage, final: false });
    expect(replay.status).toBe(200);
    expect(await openCount()).toBe(1);

    const b = await post(batch.id, {
      segments: segmentsOf(1000, SEGMENTS),
      usage: { inputTokens: 5, outputTokens: 6 },
      final: true,
    });
    expect(ChapterProgressSchema.parse(await b.json())).toMatchObject({ done: SEGMENTS });
    expect(await openCount()).toBe(0);
  });

  it("rejects a chunk over 1000 segments", async () => {
    const batch = await record();
    const res = await post(batch.id, { segments: segmentsOf(0, 1001), usage, final: false });
    expect(res.status).toBe(400);
  });
});

describe("large assets", () => {
  it("answers 413 with a clear error for an image over 4 MB", async () => {
    const res = await app.request(`/api/books/${bookId}/assets/big.png`);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/too large/i);
  });

  it("still serves a small asset", async () => {
    const res = await app.request(`/api/books/${bookId}/assets/small.png`);
    expect(res.status).toBe(200);
  });
});
