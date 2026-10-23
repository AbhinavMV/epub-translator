import {
  BookDetailSchema,
  BookSummarySchema,
  ChapterViewSchema,
  JobSummarySchema,
  ProviderInfoSchema,
} from "@et/contracts";
import {
  type ChapterRenderer,
  type EpubAssets,
  type EpubExporter,
  type EpubParser,
  InvalidEpubError,
  type ParsedBook,
} from "@et/core";
import { FakeProvider } from "@et/providers";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createServices } from "../src/services.ts";

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
  const services = createServices({
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
    expect(detail.settings.customPrompt).toBe("");
  });

  it("settings round-trip and reject invalid bodies", async () => {
    const { app } = setup();
    const book = BookSummarySchema.parse(await (await upload(app)).json());
    const settings = {
      customPrompt: "Be terse",
      glossary: [{ source: "シャル", target: "Charlotte" }],
      provider: "fake",
      model: "fake-echo",
    };
    const put = await app.request(`/api/books/${book.id}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "content-type": "application/json" },
    });
    expect(put.status).toBe(200);
    const bad = await app.request(`/api/books/${book.id}/settings`, {
      method: "PUT",
      body: JSON.stringify({ customPrompt: 1 }),
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
