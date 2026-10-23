import {
  BookSummarySchema,
  type JobSummary,
  JobSummarySchema,
  ProviderInfoSchema,
} from "@et/contracts";
import type { ChapterRenderer, EpubAssets, EpubExporter, EpubParser, ParsedBook } from "@et/core";
import { FakeBatchProvider, FakeProvider } from "@et/providers";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { startBatchPolling } from "../src/infra/batch-poller.ts";
import { createServices } from "../src/services.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一二" },
    { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: "三" },
  ],
};
const parser: EpubParser = { parse: async () => parsed };
const assets: EpubAssets = { read: async () => null };
const renderer: ChapterRenderer = {
  render: async (_b, _book, chapterId) => ({
    chapterId,
    index: 0,
    title: "",
    prevChapterId: null,
    nextChapterId: null,
    blocks: [],
  }),
};
const exporter: EpubExporter = { export: async () => new Uint8Array([1]) };

function setup() {
  const services = createServices({
    dataDir: ":memory:",
    env: {},
    epub: { parser, assets, renderer, exporter },
    fakeProvider: new FakeProvider(),
    fakeBatchProvider: new FakeBatchProvider({ endsAfterFetches: 2 }),
  });
  return { app: createApp(services), services };
}

const post = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

async function workspace(app: ReturnType<typeof createApp>) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1])], "book.epub"));
  const book = BookSummarySchema.parse(
    await (await app.request("/api/books", { method: "POST", body: form })).json(),
  );
  const job = JobSummarySchema.parse(
    await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
  );
  return job;
}

const chapterStatus = (job: JobSummary) => job.progress[0]?.status;

describe("batch mode api", () => {
  it("lists which providers support batch", async () => {
    const { app } = setup();
    const list = ProviderInfoSchema.array().parse(
      await (await app.request("/api/providers")).json(),
    );
    expect(list.find((p) => p.id === "fake")?.supportsBatch).toBe(true);
    expect(list.find((p) => p.id === "anthropic")?.supportsBatch).toBe(false);
  });

  it("submits a chapter as a batch, then applies results once the poller sees it ended", async () => {
    const { app, services } = setup();
    const job = await workspace(app);
    const res = await app.request(
      `/api/jobs/${job.id}/chapters/ch-0/translate`,
      post({ provider: "fake", model: "fake-echo", mode: "batch" }),
    );
    expect(res.status).toBe(200);
    await services.runner.whenIdle();
    expect(chapterStatus(services.runner.summary(job.id))).toBe("submitted");

    await services.runner.pollBatches();
    expect(chapterStatus(services.runner.summary(job.id))).toBe("submitted");
    await services.runner.pollBatches();
    expect(services.runner.summary(job.id).progress[0]).toMatchObject({
      status: "done",
      done: 2,
    });
  });

  it("accepts batch mode on translate-all and retry", async () => {
    const { app, services } = setup();
    const job = await workspace(app);
    const body = { provider: "fake", model: "fake-echo", mode: "batch" };
    expect((await app.request(`/api/jobs/${job.id}/translate-all`, post(body))).status).toBe(200);
    await services.runner.whenIdle();
    expect((await app.request(`/api/jobs/${job.id}/chapters/ch-0/retry`, post(body))).status).toBe(
      200,
    );
    await services.runner.whenIdle();
    expect(chapterStatus(services.runner.summary(job.id))).toBe("submitted");
  });

  it("returns 400 when the provider has no batch support", async () => {
    const { app } = setup();
    const job = await workspace(app);
    const res = await app.request(
      `/api/jobs/${job.id}/chapters/ch-0/translate`,
      post({ provider: "openai", model: "x", mode: "batch" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Provider does not support batch mode: openai" });
  });

  it("rejects an unknown mode", async () => {
    const { app } = setup();
    const job = await workspace(app);
    const res = await app.request(
      `/api/jobs/${job.id}/translate-all`,
      post({ provider: "fake", model: "m", mode: "turbo" }),
    );
    expect(res.status).toBe(400);
  });

  it("records a submitted batch in the repository so it survives a restart", async () => {
    const { app, services } = setup();
    const job = await workspace(app);
    await app.request(
      `/api/jobs/${job.id}/chapters/ch-0/translate`,
      post({ provider: "fake", model: "fake-echo", mode: "batch" }),
    );
    await services.runner.whenIdle();
    expect(services.batches.listOpen()).toHaveLength(1);
  });
});

describe("startBatchPolling", () => {
  it("polls once immediately and then on every interval until stopped", async () => {
    vi.useFakeTimers();
    try {
      let polls = 0;
      const stop = startBatchPolling(
        {
          pollBatches: async () => {
            polls++;
          },
        },
        1000,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(polls).toBe(1);
      await vi.advanceTimersByTimeAsync(2500);
      expect(polls).toBe(3);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(polls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("survives a failing poll", async () => {
    vi.useFakeTimers();
    try {
      let polls = 0;
      const stop = startBatchPolling(
        {
          pollBatches: async () => {
            polls++;
            throw new Error("boom");
          },
        },
        1000,
      );
      await vi.advanceTimersByTimeAsync(2100);
      expect(polls).toBe(3);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
