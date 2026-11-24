import {
  BookDetailSchema,
  BookSummarySchema,
  ChapterViewSchema,
  GlossaryEntrySchema,
  GlossarySamplePlanSchema,
  JobSummarySchema,
  ProjectDetailSchema,
  ProjectSettingsSchema,
  ProjectSummarySchema,
  ProviderInfoSchema,
} from "@et/contracts";
import {
  buildTermsPrompt,
  type ChapterRenderer,
  type EpubAssets,
  type EpubExporter,
  type EpubParser,
  InvalidEpubError,
  type ParsedBook,
  type TermExtractionRequest,
} from "@et/core";
import { FakeProvider, FakeTermExtractor } from "@et/providers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";

const parsed: ParsedBook = {
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  chapters: [{ id: "ch-0", index: 0, title: "第一章", docHrefs: ["a.xhtml"] }],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一二" },
    { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: "三<1>!?</1>" },
  ],
};

const EPUB_MAGIC = new TextEncoder().encode("PK-epub");

const parser: EpubParser = {
  async parse(bytes) {
    if (bytes[0] !== EPUB_MAGIC[0]) throw new InvalidEpubError("Not a zip");
    return parsed;
  },
};
const assets: EpubAssets = {
  async read(_bytes, href) {
    if (href === "image/cover.jpg") return { bytes: new Uint8Array([7]), mediaType: "image/jpeg" };
    if (href === "evil.html") return { bytes: new Uint8Array([60]), mediaType: "text/html" };
    return null;
  },
};
const renderer: ChapterRenderer = {
  async render(_b, book, chapterId, translations) {
    return {
      chapterId,
      index: 0,
      title: book.chapters[0]?.title ?? "",
      prevChapterId: null,
      nextChapterId: null,
      blocks: book.segments.map((s) => ({
        kind: "segment" as const,
        id: s.id,
        sourceHtml: `<p>${s.sourceText}</p>`,
        targetHtml: translations.get(s.id) ? `<p>${translations.get(s.id)?.text}</p>` : null,
        status: translations.get(s.id)?.status ?? "pending",
      })),
    };
  },
};
const exportLayouts: string[] = [];
const exporter: EpubExporter = {
  async export(_bytes, _book, _translations, _target, options) {
    exportLayouts.push(options.layout);
    return new Uint8Array([0x50, 0x4b]);
  },
};

function setup(env: Record<string, string | undefined> = {}) {
  const services = createLocalServices({
    dataDir: ":memory:",
    env,
    epub: { parser, assets, renderer, exporter },
    fakeProvider: new FakeProvider(),
  });
  return { app: createApp(services), services };
}

async function upload(app: ReturnType<typeof createApp>, bytes: Uint8Array = EPUB_MAGIC) {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(bytes)], "book.epub", { type: "application/epub+zip" }),
  );
  return app.request("/api/books", { method: "POST", body: form });
}

describe("books api", () => {
  it("upload then list returns the book", async () => {
    const { app } = setup();
    const res = await upload(app);
    expect(res.status).toBe(201);
    const book = BookSummarySchema.parse(await res.json());
    expect(book).toMatchObject({
      title: "本",
      chapterCount: 1,
      segmentCount: 2,
      coverUrl: `/api/books/${book.id}/cover`,
    });
    const list = await (await app.request("/api/books")).json();
    expect(list).toHaveLength(1);
  });

  it("library shows the translated title once the en workspace has one", async () => {
    const { app, services } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    expect(book.translatedTitle).toBeNull();
    const workspace = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
    );
    expect(workspace.titles).toEqual({ book: null, chapters: {} });
    await services.repos.translations.put(workspace.id, "opf#title", {
      text: "The Book",
      status: "done",
    });
    const list = z.array(BookSummarySchema).parse(await (await app.request("/api/books")).json());
    expect(list[0]?.translatedTitle).toBe("The Book");
    const project = ProjectDetailSchema.parse(
      await (await app.request(`/api/projects/${book.projectId}`)).json(),
    );
    expect(project.books[0]?.translatedTitle).toBe("The Book");
    const again = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
    );
    expect(again.titles.book).toBe("The Book");
  });

  it("upload of non-epub returns 422", async () => {
    const { app } = setup();
    const res = await upload(app, new Uint8Array([1, 2, 3]));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Not a zip" });
  });

  it("book detail includes chapters with char counts and settings", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const detail = BookDetailSchema.parse(
      await (await app.request(`/api/books/${book.id}`)).json(),
    );
    expect(detail.chapters[0]).toMatchObject({ id: "ch-0", segmentCount: 2, charCount: 5 });
    expect(detail.settings).toEqual({ provider: null, model: null });
  });

  it("settings round-trip and reject invalid bodies", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const settings = { provider: "fake", model: "fake-echo" };
    const put = await app.request(`/api/books/${book.id}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "content-type": "application/json" },
    });
    expect(put.status).toBe(200);
    const bad = await app.request(`/api/books/${book.id}/settings`, {
      method: "PUT",
      body: JSON.stringify({ provider: "nope" }),
      headers: { "content-type": "application/json" },
    });
    expect(bad.status).toBe(400);
    const detail = BookDetailSchema.parse(
      await (await app.request(`/api/books/${book.id}`)).json(),
    );
    expect(detail.settings).toEqual(settings);
  });

  it("serves the cover and 404s missing assets", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const cover = await app.request(`/api/books/${book.id}/cover`);
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
    expect((await app.request(`/api/books/${book.id}/assets/nope.png`)).status).toBe(404);
  });

  it("serves book assets sandboxed so embedded scripts cannot run on the app origin", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const cover = await app.request(`/api/books/${book.id}/cover`);
    expect(cover.headers.get("content-security-policy")).toContain("sandbox");
    expect(cover.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await app.request(`/api/books/${book.id}/assets/evil.html`);
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toContain("attachment");
  });

  it("delete removes the book", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    expect((await app.request(`/api/books/${book.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await app.request(`/api/books/${book.id}`)).status).toBe(404);
  });
});

describe("projects api", () => {
  it("an upload appears in the library as a one-volume project", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    expect(book.volumeNumber).toBe(1);
    const list = z
      .array(ProjectSummarySchema)
      .parse(await (await app.request("/api/projects")).json());
    expect(list).toEqual([
      {
        id: book.projectId,
        name: "本",
        createdAt: book.createdAt,
        volumeCount: 1,
        coverUrl: `/api/books/${book.id}/cover`,
        fullyTranslatedLang: null,
        mainLang: null,
        translatedVolumeCount: 0,
      },
    ]);
  });

  it("reports the main language and progress in it across volumes and languages", async () => {
    const { app, services } = setup();
    const one = BookSummarySchema.parse(await (await upload(app)).json());
    const two = BookSummarySchema.parse(
      await (await upload(app, new Uint8Array([...EPUB_MAGIC, 2]))).json(),
    );
    const projectId = one.projectId ?? "";
    expect(two.projectId).toBe(projectId);
    await services.repos.projects.create({ id: "empty", name: "Empty", createdAt: "2026-01-01" });
    const job = async (bookId: string, lang: string) =>
      JobSummarySchema.parse(
        await (await app.request(`/api/books/${bookId}/workspace?targetLang=${lang}`)).json(),
      ).id;
    const oneFr = await job(one.id, "fr");
    const twoEs = await job(two.id, "es");
    const twoFr = await job(two.id, "fr");
    const progress = async () => {
      const list = z
        .array(ProjectSummarySchema)
        .parse(await (await app.request("/api/projects")).json());
      const detail = ProjectDetailSchema.parse(
        await (await app.request(`/api/projects/${projectId}`)).json(),
      );
      const summary = list.find((p) => p.id === projectId);
      const percent = (id: string) => detail.books.find((b) => b.id === id)?.translatedPercent;
      return {
        mainLang: [summary?.mainLang, detail.mainLang],
        translatedVolumeCount: summary?.translatedVolumeCount,
        fullyTranslatedLang: summary?.fullyTranslatedLang,
        percents: [percent(one.id), percent(two.id)],
      };
    };
    const put = (jobId: string, segmentId: string, status: "done" | "flagged" = "done") =>
      services.repos.translations.put(jobId, segmentId, { text: "t", status });

    expect(await progress()).toEqual({
      mainLang: [null, null],
      translatedVolumeCount: 0,
      fullyTranslatedLang: null,
      percents: [null, null],
    });

    await put(oneFr, "a.xhtml#0");
    await put(twoEs, "a.xhtml#0");
    expect(await progress()).toEqual({
      mainLang: ["es", "es"],
      translatedVolumeCount: 0,
      fullyTranslatedLang: null,
      percents: [0, 50],
    });

    await put(oneFr, "a.xhtml#1", "flagged");
    expect(await progress()).toEqual({
      mainLang: ["fr", "fr"],
      translatedVolumeCount: 1,
      fullyTranslatedLang: null,
      percents: [100, 0],
    });

    await put(twoFr, "a.xhtml#0");
    await put(twoFr, "a.xhtml#1");
    expect(await progress()).toEqual({
      mainLang: ["fr", "fr"],
      translatedVolumeCount: 2,
      fullyTranslatedLang: "fr",
      percents: [100, 100],
    });

    const empty = z
      .array(ProjectSummarySchema)
      .parse(await (await app.request("/api/projects")).json())
      .find((p) => p.id === "empty");
    expect(empty).toMatchObject({ volumeCount: 0, mainLang: null, translatedVolumeCount: 0 });
  });

  it("reports a project fully translated once every segment is done or flagged", async () => {
    const { app, services } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const workspace = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=fr`)).json(),
    );
    const fullyTranslated = async () => {
      const [summary] = z
        .array(ProjectSummarySchema)
        .parse(await (await app.request("/api/projects")).json());
      const detail = ProjectDetailSchema.parse(
        await (await app.request(`/api/projects/${book.projectId}`)).json(),
      );
      return [
        summary?.fullyTranslatedLang,
        detail.fullyTranslatedLang,
        detail.books[0]?.translatedLang,
      ];
    };
    await services.repos.translations.put(workspace.id, "a.xhtml#0", { text: "a", status: "done" });
    expect(await fullyTranslated()).toEqual([null, null, null]);
    await services.repos.translations.put(workspace.id, "a.xhtml#1", {
      text: "b",
      status: "flagged",
    });
    expect(await fullyTranslated()).toEqual(["fr", "fr", "fr"]);
  });

  it("project page lists books in volume order and shows volume 1's cover in the library", async () => {
    const { app, services } = setup();
    const first = BookSummarySchema.parse(await (await upload(app)).json());
    const second = BookSummarySchema.parse(
      await (await upload(app, new Uint8Array([...EPUB_MAGIC, 2]))).json(),
    );
    const projectId = first.projectId ?? "";
    expect(second.projectId).toBe(projectId);
    await services.repos.books.place(first.id, projectId, 2);
    await services.repos.books.place(second.id, projectId, 1);

    const detail = ProjectDetailSchema.parse(
      await (await app.request(`/api/projects/${projectId}`)).json(),
    );
    expect(detail.books.map((b) => [b.id, b.volumeNumber])).toEqual([
      [second.id, 1],
      [first.id, 2],
    ]);
    const [summary] = z
      .array(ProjectSummarySchema)
      .parse(await (await app.request("/api/projects")).json());
    expect(summary).toMatchObject({ volumeCount: 2, coverUrl: `/api/books/${second.id}/cover` });
  });

  it("renames a project and rejects blank names", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const rename = (name: unknown) =>
      app.request(`/api/projects/${book.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
        headers: { "content-type": "application/json" },
      });
    const res = await rename("  Spice and Wolf ");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: book.projectId, name: "Spice and Wolf" });
    expect((await rename("   ")).status).toBe(400);
    const detail = ProjectDetailSchema.parse(
      await (await app.request(`/api/projects/${book.projectId}`)).json(),
    );
    expect(detail.name).toBe("Spice and Wolf");
  });

  it("404s an unknown project", async () => {
    const { app } = setup();
    expect((await app.request("/api/projects/nope")).status).toBe(404);
    const res = await app.request("/api/projects/nope", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(404);
  });
});

describe("glossary suggestion api", () => {
  const latin: ParsedBook = {
    ...parsed,
    segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "Alice met Bob." }],
  };
  const post = (app: ReturnType<typeof createApp>, id: string, body: unknown) =>
    app.request(`/api/books/${id}/glossary/suggest`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

  class RecordingTermExtractor extends FakeTermExtractor {
    prompts: string[] = [];
    samples: string[] = [];
    override extractTerms(req: TermExtractionRequest, signal: AbortSignal) {
      this.prompts.push(buildTermsPrompt(req).system);
      this.samples.push(req.sample);
      return super.extractTerms(req, signal);
    }
  }

  async function setupLatin() {
    const extractor = new RecordingTermExtractor();
    const services = createLocalServices({
      dataDir: ":memory:",
      env: {},
      epub: { parser: { parse: async () => latin }, assets, renderer, exporter },
      fakeProvider: new FakeProvider(),
      fakeTermExtractor: extractor,
    });
    const app = createApp(services);
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    return { app, book, extractor };
  }

  it("builds the suggestion prompt with the project's custom prompt and glossary renderings", async () => {
    const { app, book, extractor } = await setupLatin();
    await app.request(`/api/projects/${book.projectId}/settings`, {
      method: "PUT",
      body: JSON.stringify({
        customPrompt: "Keep honorifics.",
        glossary: [{ source: "Alice", target: "Alicia" }],
      }),
      headers: { "content-type": "application/json" },
    });

    await post(app, book.id, { provider: "fake", model: "fake-echo" });

    expect(extractor.prompts).toHaveLength(1);
    expect(extractor.prompts[0]).toContain("Style instructions from the reader: Keep honorifics.");
    expect(extractor.prompts[0]).toContain("- Alice → Alicia");
  });

  it("returns unsaved suggestions that skip existing glossary sources, with usage headers", async () => {
    const { app, book } = await setupLatin();
    await app.request(`/api/projects/${book.projectId}/settings`, {
      method: "PUT",
      body: JSON.stringify({ customPrompt: "", glossary: [{ source: "Alice", target: "Alicia" }] }),
      headers: { "content-type": "application/json" },
    });

    const res = await post(app, book.id, { provider: "fake", model: "fake-echo" });

    expect(res.status).toBe(200);
    expect(
      z
        .array(GlossaryEntrySchema)
        .parse(await res.json())
        .map((t) => t.source),
    ).toEqual(["Bob"]);
    expect(Number(res.headers.get("x-usage-input-tokens"))).toBeGreaterThan(0);
    const project = ProjectSettingsSchema.parse(
      await (await app.request(`/api/projects/${book.projectId}/settings`)).json(),
    );
    expect(project.glossary).toHaveLength(1);
  });

  it("samples the requested size and chunk, and rejects a chunk past the end", async () => {
    const { app, book, extractor } = await setupLatin();

    const ok = await post(app, book.id, {
      provider: "fake",
      model: "fake-echo",
      sampleSize: "volume",
      chunk: 0,
    });
    expect(ok.status).toBe(200);
    expect(extractor.samples).toEqual(["第一章\nAlice met Bob."]);

    const past = await post(app, book.id, {
      provider: "fake",
      model: "fake-echo",
      sampleSize: "volume",
      chunk: 1,
    });
    expect(past.status).toBe(400);
    expect(
      (await post(app, book.id, { provider: "fake", model: "m", sampleSize: "x" })).status,
    ).toBe(400);
  });

  it("plans one request per chunk of an entire volume", async () => {
    const { app, book } = await setupLatin();
    const res = await app.request(`/api/books/${book.id}/glossary/plan?size=volume`);
    expect(GlossarySamplePlanSchema.parse(await res.json())).toEqual({ requests: 1, chars: 18 });
    expect((await app.request(`/api/books/nope/glossary/plan`)).status).toBe(404);
  });

  it("returns 400 for a provider that is not configured", async () => {
    const { app, book } = await setupLatin();
    const res = await post(app, book.id, { provider: "openai", model: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid body and 404 for an unknown book", async () => {
    const { app, book } = await setupLatin();
    expect((await post(app, book.id, { provider: "fake" })).status).toBe(400);
    expect((await post(app, "nope", { provider: "fake", model: "m" })).status).toBe(404);
  });
});

describe("jobs api", () => {
  async function workspace(app: ReturnType<typeof createApp>) {
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const job = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
    );
    return { book, job };
  }
  const json = (body: unknown) => ({
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

  it("translating a chapter with the fake provider completes and exports", async () => {
    const { app, services } = setup();
    const { book, job } = await workspace(app);
    const res = await app.request(
      `/api/jobs/${job.id}/chapters/ch-0/translate`,
      json({ provider: "fake", model: "fake-echo" }),
    );
    expect(res.status).toBe(200);
    await services.runner.whenIdle();
    const done = JobSummarySchema.parse(await (await app.request(`/api/jobs/${job.id}`)).json());
    expect(done.status).toBe("done");
    const view = ChapterViewSchema.parse(
      await (await app.request(`/api/books/${book.id}/chapters/ch-0?jobId=${job.id}`)).json(),
    );
    expect(view.blocks[0]).toMatchObject({ status: "done", targetHtml: "<p>[en] 一二</p>" });
    const epub = await app.request(`/api/jobs/${job.id}/export`);
    expect(epub.headers.get("content-type")).toBe("application/epub+zip");
    expect(epub.headers.get("content-disposition")).toContain("attachment");
    expect(exportLayouts.at(-1)).toBe("translation");
    const txt = await app.request(`/api/jobs/${job.id}/export.txt`);
    expect(await txt.text()).toContain("[en] 一二");
  });

  it("export honours the layout query and rejects unknown layouts", async () => {
    const { app } = setup();
    const { job } = await workspace(app);
    const bilingual = await app.request(`/api/jobs/${job.id}/export?layout=bilingual`);
    expect(bilingual.status).toBe(200);
    expect(exportLayouts.at(-1)).toBe("bilingual");
    expect(bilingual.headers.get("content-disposition")).toContain("(en%2C%20bilingual).epub");
    const explicit = await app.request(`/api/jobs/${job.id}/export?layout=translation`);
    expect(explicit.status).toBe(200);
    expect(exportLayouts.at(-1)).toBe("translation");
    expect((await app.request(`/api/jobs/${job.id}/export?layout=sideways`)).status).toBe(400);
  });

  it("workspace is stable per book and language and rejects unknown languages", async () => {
    const { app } = setup();
    const { book, job } = await workspace(app);
    const again = JobSummarySchema.parse(
      await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
    );
    expect(again.id).toBe(job.id);
    expect((await app.request(`/api/books/${book.id}/workspace?targetLang=xx`)).status).toBe(400);
  });

  it("unconfigured provider returns 400", async () => {
    const { app } = setup();
    const { job } = await workspace(app);
    const res = await app.request(
      `/api/jobs/${job.id}/translate-all`,
      json({ provider: "anthropic", model: "claude-sonnet-5-5" }),
    );
    expect(res.status).toBe(400);
  });

  it("clear and retry endpoints return the job summary", async () => {
    const { app, services } = setup();
    const { job } = await workspace(app);
    await app.request(
      `/api/jobs/${job.id}/chapters/ch-0/translate`,
      json({ provider: "fake", model: "fake-echo" }),
    );
    await services.runner.whenIdle();
    const cleared = JobSummarySchema.parse(
      await (
        await app.request(`/api/jobs/${job.id}/chapters/ch-0/clear`, { method: "POST" })
      ).json(),
    );
    expect(cleared.progress[0]).toMatchObject({ status: "idle", done: 0 });
    const retried = await app.request(
      `/api/jobs/${job.id}/chapters/ch-0/retry`,
      json({ provider: "fake", model: "fake-echo" }),
    );
    expect(retried.status).toBe(200);
    await services.runner.whenIdle();
  });

  it("sse stream emits initial job.status", async () => {
    const { app } = setup();
    const { job } = await workspace(app);
    const controller = new AbortController();
    const res = await app.request(`/api/jobs/${job.id}/events`, { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body?.getReader();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);
    expect(text).toContain('"type":"job.status"');
    controller.abort();
    await reader?.cancel();
  });
});

describe("host check", () => {
  it("rejects requests whose Host is not a local name (dns rebinding)", async () => {
    const { app } = setup();
    const evil = await app.request("http://evil.example:8787/api/books", {
      headers: { host: "evil.example:8787" },
    });
    expect(evil.status).toBe(403);
    for (const host of ["localhost:5173", "127.0.0.1:8787", "[::1]:8787"]) {
      const ok = await app.request(`http://${host}/api/books`, { headers: { host } });
      expect(ok.status, host).toBe(200);
    }
  });
});

describe("providers api", () => {
  it("never returns keys and marks configuration", async () => {
    const { app } = setup({ ANTHROPIC_API_KEY: "sk-secret-123" });
    const res = await app.request("/api/providers");
    const text = await res.text();
    expect(text).not.toContain("sk-secret");
    const providers = ProviderInfoSchema.array().parse(JSON.parse(text));
    expect(providers.find((p) => p.id === "anthropic")).toMatchObject({
      configured: true,
      defaultModel: "claude-sonnet-5-5",
    });
    expect(providers.find((p) => p.id === "openai")).toMatchObject({
      configured: false,
      models: [],
    });
    expect(providers.find((p) => p.id === "fake")).toMatchObject({
      configured: true,
      models: ["fake-echo"],
    });
  });
});
