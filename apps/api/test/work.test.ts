import {
  BatchPlanSchema,
  BookSummarySchema,
  ChapterProgressSchema,
  GlossarySampleSchema,
  JobSummarySchema,
  PublicConfigSchema,
  RecordedBatchSchema,
  WorkUnitSchema,
} from "@et/contracts";
import type { ChapterRenderer, EpubAssets, EpubExporter, EpubParser, ParsedBook } from "@et/core";
import { FakeProvider } from "@et/providers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";
import { LOCAL_PUBLIC_CONFIG } from "../src/http/config.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一二" },
    { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: "三<1>!</1>" },
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

const FAKE_KEY = "sk-fake-should-never-be-accepted-1234";

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

const lease = () => app.request(`/api/jobs/${jobId}/chapters/ch-0/lease`, send("POST"));

describe("config", () => {
  it("is public and reports client execution", async () => {
    const res = await app.request("/api/config");
    expect(PublicConfigSchema.parse(await res.json())).toEqual({
      authMode: "none",
      supabaseUrl: null,
      supabasePublishableKey: null,
      uploadMode: "multipart",
      maxUploadBytes: 200 * 1024 * 1024,
      clientExecution: true,
    });
  });
});

describe("lease and results", () => {
  it("hands out a work unit, accepts vetted results and then reports 204", async () => {
    const res = await lease();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const unit = WorkUnitSchema.parse(await res.json());
    expect(unit.segments.map((s) => s.id)).toEqual(["a.xhtml#0", "a.xhtml#1"]);

    const posted = await app.request(
      `/api/jobs/${jobId}/results`,
      send("POST", {
        leaseId: unit.leaseId,
        segments: [
          { id: "a.xhtml#0", text: "One two", status: "done" },
          { id: "a.xhtml#1", text: "three without tags", status: "done" },
        ],
        usage: { inputTokens: 5, outputTokens: 6 },
      }),
    );
    expect(posted.status).toBe(200);
    expect(ChapterProgressSchema.parse(await posted.json())).toMatchObject({
      done: 1,
      flagged: 1,
      status: "done",
    });
    expect((await lease()).status).toBe(204);
    const job = JobSummarySchema.parse(await (await app.request(`/api/jobs/${jobId}`)).json());
    expect(job.usage).toEqual({ inputTokens: 5, outputTokens: 6 });
  });

  it("gives two concurrent callers disjoint segments", async () => {
    const a = WorkUnitSchema.parse(await (await lease()).json());
    expect((await lease()).status).toBe(204);
    expect(a.segments).toHaveLength(2);
  });

  it("answers 409 for a reused lease and 400 for foreign segments", async () => {
    const unit = WorkUnitSchema.parse(await (await lease()).json());
    const bad = await app.request(
      `/api/jobs/${jobId}/results`,
      send("POST", {
        leaseId: unit.leaseId,
        segments: [{ id: "nope#0", text: "x", status: "done" }],
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    );
    expect(bad.status).toBe(400);
    const body = {
      leaseId: unit.leaseId,
      segments: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    expect((await app.request(`/api/jobs/${jobId}/results`, send("POST", body))).status).toBe(200);
    expect((await app.request(`/api/jobs/${jobId}/results`, send("POST", body))).status).toBe(409);
  });

  it("rejects any extra field, including ones named like a key", async () => {
    const unit = WorkUnitSchema.parse(await (await lease()).json());
    for (const extra of [{ apiKey: FAKE_KEY }, { key: FAKE_KEY }, { "x-provider-key": FAKE_KEY }]) {
      const res = await app.request(
        `/api/jobs/${jobId}/results`,
        send("POST", {
          leaseId: unit.leaseId,
          segments: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          ...extra,
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.text()).not.toContain(FAKE_KEY);
    }
  });

  it("honours the cursor and rejects unknown lease fields", async () => {
    const past = await app.request(
      `/api/jobs/${jobId}/chapters/ch-0/lease`,
      send("POST", { after: "a.xhtml#1" }),
    );
    expect(past.status).toBe(204);
    const bad = await app.request(
      `/api/jobs/${jobId}/chapters/ch-0/lease`,
      send("POST", { apiKey: FAKE_KEY }),
    );
    expect(bad.status).toBe(400);
  });

  it("frees a lease on DELETE so the segments can be leased again", async () => {
    const unit = WorkUnitSchema.parse(await (await lease()).json());
    expect((await lease()).status).toBe(204);
    const del = await app.request(`/api/jobs/${jobId}/leases/${unit.leaseId}`, send("DELETE"));
    expect(del.status).toBe(204);
    expect(WorkUnitSchema.parse(await (await lease()).json()).segments).toHaveLength(2);
    expect(
      (await app.request(`/api/jobs/${jobId}/leases/${unit.leaseId}`, send("DELETE"))).status,
    ).toBe(204);
  });

  it("frees leases when the chapter is cleared, retried or the job cancelled", async () => {
    await lease();
    await app.request(`/api/jobs/${jobId}/chapters/ch-0/clear`, send("POST"));
    expect((await lease()).status).toBe(200);
    await app.request(`/api/jobs/${jobId}/cancel`, send("POST"));
    expect((await lease()).status).toBe(200);
  });

  it("404s for an unknown chapter", async () => {
    const res = await app.request(`/api/jobs/${jobId}/chapters/zzz/lease`, send("POST"));
    expect(res.status).toBe(404);
  });
});

describe("client batches", () => {
  async function plan() {
    return BatchPlanSchema.parse(
      await (await app.request(`/api/jobs/${jobId}/chapters/ch-0/batch-plan`, send("POST"))).json(),
    );
  }
  const record = (segmentIds: string[][]) =>
    app.request(
      `/api/jobs/${jobId}/batches`,
      send("POST", {
        chapterId: "ch-0",
        provider: "anthropic",
        model: "m",
        vendorBatchId: "vb-1",
        segmentIds,
      }),
    );

  it("plans, records, lists, applies results and closes the batch", async () => {
    const { units } = await plan();
    expect(units).toHaveLength(1);
    const recorded = await record([units[0]?.segments.map((s) => s.id) ?? []]);
    expect(recorded.status).toBe(201);
    const batch = RecordedBatchSchema.parse(await recorded.json());
    expect(batch.status).toBe("submitted");
    expect((await plan()).units).toEqual([]);

    const open = await (await app.request(`/api/jobs/${jobId}/batches`)).json();
    expect(open).toHaveLength(1);
    const summary = JobSummarySchema.parse(await (await app.request(`/api/jobs/${jobId}`)).json());
    expect(summary.progress[0]?.status).toBe("submitted");

    const res = await app.request(
      `/api/jobs/${jobId}/batches/${batch.id}/results`,
      send("POST", {
        segments: [
          { id: "a.xhtml#0", text: "One two", status: "done" },
          { id: "a.xhtml#1", text: "x", status: "failed", note: "refused" },
        ],
        usage: { inputTokens: 1, outputTokens: 1 },
        final: true,
      }),
    );
    expect(ChapterProgressSchema.parse(await res.json())).toMatchObject({ done: 1, failed: 1 });
    expect(await (await app.request(`/api/jobs/${jobId}/batches`)).json()).toEqual([]);
  });

  it("refuses a second open batch", async () => {
    expect((await record([["a.xhtml#0"]])).status).toBe(201);
    expect((await record([["a.xhtml#1"]])).status).toBe(409);
  });

  it("marks a batch failed through PATCH", async () => {
    const batch = RecordedBatchSchema.parse(await (await record([["a.xhtml#0"]])).json());
    const res = await app.request(
      `/api/jobs/${jobId}/batches/${batch.id}`,
      send("PATCH", { status: "failed", error: "expired" }),
    );
    expect(res.status).toBe(200);
    expect(await (await app.request(`/api/jobs/${jobId}/batches`)).json()).toEqual([]);
    const bad = await app.request(
      `/api/jobs/${jobId}/batches/${batch.id}`,
      send("PATCH", { status: "ended" }),
    );
    expect(bad.status).toBe(400);
  });
});

describe("glossary sample", () => {
  it("returns the sample, source language and existing glossary", async () => {
    const res = await app.request(`/api/books/${bookId}/glossary/sample?targetLang=fr`);
    const sample = GlossarySampleSchema.parse(await res.json());
    expect(sample).toMatchObject({ sourceLang: "ja", bookTitle: "本", targetLang: "fr" });
    expect(sample.sample).toContain("一二");
  });
});
