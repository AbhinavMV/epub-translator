import {
  BookDetailSchema,
  BookSummarySchema,
  GlossaryEntrySchema,
  JobSummarySchema,
  ProjectSettingsSchema,
} from "@et/contracts";
import type { ParsedBook, SegmentBatchRequest } from "@et/core";
import { FakeProvider } from "@et/providers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";

const parsed: ParsedBook = {
  title: "魔女の旅々",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [
    { id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] },
    { id: "ch-1", index: 1, title: "二", docHrefs: ["b.xhtml"] },
  ],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "イレイナは灰の魔女だ。" },
    {
      id: "b.xhtml#0",
      chapterId: "ch-1",
      ordinal: 0,
      sourceText: "イレイナとシャルロットは旅に出た。",
    },
  ],
};

const unused = async () => {
  throw new Error("unused");
};

class RecordingProvider extends FakeProvider {
  readonly requests: SegmentBatchRequest[] = [];
  override async translateSegments(req: SegmentBatchRequest, signal: AbortSignal) {
    this.requests.push(req);
    return super.translateSegments(req, signal);
  }
}

const send = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { "content-type": "application/json" },
});

async function setup() {
  const provider = new RecordingProvider();
  const services = createLocalServices({
    dataDir: ":memory:",
    env: {},
    epub: {
      parser: { parse: async () => parsed },
      assets: { read: unused },
      renderer: { render: unused },
      exporter: { export: unused },
    },
    fakeProvider: provider,
  });
  const app = createApp(services);
  const upload = async (byte: number) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([byte])], "b.epub"));
    return BookSummarySchema.parse(
      await (await app.request("/api/books", { method: "POST", body: form })).json(),
    );
  };
  const first = await upload(1);
  const second = await upload(2);
  const projectId = first.projectId ?? "";
  if (second.projectId !== projectId) {
    await services.repos.books.place(second.id, projectId, 2);
    await services.repos.projects.delete(second.projectId ?? "");
  }
  expect((await services.repos.books.listByProject(projectId)).map((b) => b.id)).toEqual([
    first.id,
    second.id,
  ]);

  const putTerms = (body: unknown) =>
    app.request(`/api/projects/${projectId}/settings`, send("PUT", body));
  const translate = async (bookId: string, chapterId: string) => {
    const job = JobSummarySchema.parse(
      await (await app.request(`/api/books/${bookId}/workspace?targetLang=en`)).json(),
    );
    const res = await app.request(
      `/api/jobs/${job.id}/chapters/${chapterId}/translate`,
      send("POST", { provider: "fake", model: "fake-echo" }),
    );
    expect(res.status).toBe(200);
    await services.runner.whenIdle();
    return provider.requests.at(-1);
  };
  return { app, services, provider, projectId, first, second, putTerms, translate };
}

const terms = {
  customPrompt: "Keep honorifics.",
  glossary: [
    { source: "イレイナ", target: "Elaina" },
    { source: "灰の魔女", target: "Ashen Witch" },
  ],
};

describe("project glossary and custom prompt", () => {
  it("translate every book of the project with the same glossary and prompt", async () => {
    const { first, second, putTerms, translate } = await setup();
    expect((await putTerms(terms)).status).toBe(200);

    const a = await translate(first.id, "ch-0");
    const b = await translate(second.id, "ch-0");
    expect(a).toMatchObject({ instructions: "Keep honorifics.", glossary: terms.glossary });
    expect(b).toMatchObject({ instructions: "Keep honorifics.", glossary: terms.glossary });
  });

  it("apply an edit to the next request of every book in the project", async () => {
    const { first, second, putTerms, translate } = await setup();
    await putTerms(terms);
    await translate(first.id, "ch-0");

    await putTerms({
      customPrompt: "Use a light tone.",
      glossary: [{ source: "イレイナ", target: "Irena" }],
    });
    for (const bookId of [first.id, second.id]) {
      expect(await translate(bookId, "ch-1")).toMatchObject({
        instructions: "Use a light tone.",
        glossary: [{ source: "イレイナ", target: "Irena" }],
      });
    }
  });

  it("are no longer part of a book's settings", async () => {
    const { app, first, putTerms } = await setup();
    await putTerms(terms);
    const put = await app.request(
      `/api/books/${first.id}/settings`,
      send("PUT", { provider: "fake", model: "fake-echo" }),
    );
    expect(put.status).toBe(200);
    const detail = BookDetailSchema.parse(
      await (await app.request(`/api/books/${first.id}`)).json(),
    );
    expect(detail.settings).toEqual({ provider: "fake", model: "fake-echo" });
  });
});

describe("project settings api", () => {
  it("starts empty, round-trips the glossary and prompt, and rejects invalid bodies", async () => {
    const { app, projectId, putTerms } = await setup();
    const get = async () =>
      ProjectSettingsSchema.parse(
        await (await app.request(`/api/projects/${projectId}/settings`)).json(),
      );
    expect(await get()).toEqual({ customPrompt: "", glossary: [], glossaryConflicts: [] });

    const put = await putTerms(terms);
    expect(ProjectSettingsSchema.parse(await put.json())).toEqual({
      ...terms,
      glossaryConflicts: [],
    });
    expect(await get()).toEqual({ ...terms, glossaryConflicts: [] });
    expect((await putTerms({ customPrompt: 1 })).status).toBe(400);
  });

  it("accepts 5,000 glossary entries and rejects more", async () => {
    const { putTerms } = await setup();
    const entries = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ source: `語${i}`, target: `term ${i}` }));
    expect((await putTerms({ customPrompt: "", glossary: entries(5000) })).status).toBe(200);
    expect((await putTerms({ customPrompt: "", glossary: entries(5001) })).status).toBe(400);
  });

  it("keeps glossary conflicts when the glossary is edited", async () => {
    const { services, projectId, putTerms } = await setup();
    const conflict = {
      source: "灰の魔女",
      inForce: { target: "Ashen Witch", bookId: "b2", volumeNumber: 2 },
      alternatives: [{ target: "Witch of Ashes", bookId: "b1", volumeNumber: 1 }],
    };
    await services.repos.projects.putSettings(projectId, {
      ...terms,
      glossaryConflicts: [conflict],
    });
    const res = await putTerms({ ...terms, customPrompt: "" });
    expect(ProjectSettingsSchema.parse(await res.json()).glossaryConflicts).toEqual([conflict]);
  });

  it("404s an unknown project", async () => {
    const { app } = await setup();
    expect((await app.request("/api/projects/nope/settings")).status).toBe(404);
    expect((await app.request("/api/projects/nope/settings", send("PUT", terms))).status).toBe(404);
  });
});

describe("suggest glossary", () => {
  it("skips terms already in the project glossary and leaves saving to the project", async () => {
    const { app, second, putTerms } = await setup();
    await putTerms({ customPrompt: "", glossary: [terms.glossary[0]] });

    const res = await app.request(
      `/api/books/${second.id}/glossary/suggest`,
      send("POST", { provider: "fake", model: "fake-echo" }),
    );
    expect(res.status).toBe(200);
    const suggested = z.array(GlossaryEntrySchema).parse(await res.json());
    expect(suggested.map((t) => t.source)).not.toContain("イレイナ");
    expect(suggested.length).toBeGreaterThan(0);

    const saved = await putTerms({ customPrompt: "", glossary: [terms.glossary[0], ...suggested] });
    expect(ProjectSettingsSchema.parse(await saved.json()).glossary).toHaveLength(
      1 + suggested.length,
    );
  });
});
