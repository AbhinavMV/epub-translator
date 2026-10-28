import { BookSummarySchema, JobSummarySchema, LOCAL_OWNER_ID } from "@et/contracts";
import type { ChapterRenderer, EpubAssets, EpubExporter, EpubParser, ParsedBook } from "@et/core";
import { FakeProvider } from "@et/providers";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { composeHostedServices } from "../src/compose-hosted.ts";
import { createLocalServices } from "../src/compose-local.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一二" }],
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

describe("local mode ownership", () => {
  it("serves every request as the local owner", async () => {
    const services = createLocalServices({
      dataDir: ":memory:",
      env: {},
      epub: { parser, assets, renderer, exporter },
      fakeProvider: new FakeProvider(),
    });
    const resolved: string[] = [];
    const factory = services.factory;
    const app = createApp({
      ...services,
      factory: {
        forOwner: (ownerId) => {
          resolved.push(ownerId);
          return factory.forOwner(ownerId);
        },
      },
    });

    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "book.epub"));
    const book = BookSummarySchema.parse(
      await (await app.request("/api/books", { method: "POST", body: form })).json(),
    );
    const job = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
    );
    await app.request(`/api/jobs/${job.id}/translate-all`, {
      method: "POST",
      body: JSON.stringify({ provider: "fake", model: "fake-echo" }),
      headers: { "content-type": "application/json" },
    });
    await services.runner.whenIdle();
    expect((await app.request("/api/books")).status).toBe(200);
    expect((await app.request(`/api/jobs/${job.id}`)).status).toBe(200);

    expect(resolved.length).toBeGreaterThan(4);
    expect(new Set(resolved)).toEqual(new Set([LOCAL_OWNER_ID]));
    const stored = services.repos;
    expect(await stored.books.get(book.id)).not.toBeNull();
    expect((await stored.translations.forJob(job.id)).size).toBe(1);
  });

  it("resolves the owner per request through ownerOf", async () => {
    const services = createLocalServices({
      dataDir: ":memory:",
      env: {},
      epub: { parser, assets, renderer, exporter },
    });
    const seen: string[] = [];
    const app = createApp({
      ...services,
      ownerOf: (request) => {
        seen.push(new URL(request.url).pathname);
        return LOCAL_OWNER_ID;
      },
    });
    await app.request("/api/books");
    await app.request("/api/providers");
    expect(seen).toEqual(["/api/books", "/api/providers"]);
  });
});

describe("hosted composition", () => {
  it("is a stub until the hosted adapters are wired in", () => {
    expect(() => composeHostedServices({})).toThrow("hosted mode not configured");
  });
});
