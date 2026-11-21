import {
  BookSummarySchema,
  type ImportPlacement,
  ImportPreviewSchema,
  ProjectDetailSchema,
  ProjectSummarySchema,
} from "@et/contracts";
import type { ChapterRenderer, EpubAssets, EpubExporter, EpubParser } from "@et/core";
import { FakeProvider } from "@et/providers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";

const MAGIC = "PK";

const parser: EpubParser = {
  async parse(bytes) {
    return {
      title: new TextDecoder().decode(bytes).slice(MAGIC.length),
      author: null,
      sourceLang: "ja",
      coverHref: null,
      chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
      segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一" }],
    };
  },
};
const unused = async () => {
  throw new Error("unused");
};

function setup() {
  const services = createLocalServices({
    dataDir: ":memory:",
    env: {},
    epub: {
      parser,
      assets: { read: unused } as EpubAssets,
      renderer: { render: unused } as ChapterRenderer,
      exporter: { export: unused } as EpubExporter,
    },
    fakeProvider: new FakeProvider(),
  });
  const app = createApp(services);

  const form = (title: string, placement?: ImportPlacement) => {
    const body = new FormData();
    body.append("file", new File([`${MAGIC}${title}`], "book.epub"));
    if (placement) body.append("placement", JSON.stringify(placement));
    return body;
  };
  const preview = async (title: string) => {
    const res = await app.request("/api/books/preview", { method: "POST", body: form(title) });
    expect(res.status).toBe(200);
    return ImportPreviewSchema.parse(await res.json());
  };
  const upload = (title: string, placement?: ImportPlacement) =>
    app.request("/api/books", { method: "POST", body: form(title, placement) });
  const imported = async (title: string, placement?: ImportPlacement) => {
    const res = await upload(title, placement);
    expect(res.status).toBe(201);
    return BookSummarySchema.parse(await res.json());
  };
  const send = (method: string, path: string, body: unknown) =>
    app.request(path, {
      method,
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  const projects = async () =>
    z.array(ProjectSummarySchema).parse(await (await app.request("/api/projects")).json());
  const project = async (id: string) =>
    ProjectDetailSchema.parse(await (await app.request(`/api/projects/${id}`)).json());

  return { app, preview, upload, imported, send, projects, project };
}

describe("import into a project", () => {
  it("suggests the existing project for a second volume, even after a rename", async () => {
    const api = setup();
    const first = await api.imported("魔女の旅々 1");
    await api.send("PATCH", `/api/projects/${first.projectId}`, { name: "Wandering Witch" });

    expect(await api.preview("魔女の旅々 2")).toEqual({
      kind: "new",
      title: "魔女の旅々 2",
      seriesTitle: "魔女の旅々",
      volumeNumber: 2,
      project: { id: first.projectId, name: "Wandering Witch", createdAt: first.createdAt },
    });
    expect(await api.projects()).toHaveLength(1);
  });

  it("suggests a new project for an unrelated book", async () => {
    const api = setup();
    await api.imported("魔女の旅々 1");
    expect(await api.preview("Spice and Wolf Vol. 1")).toMatchObject({
      kind: "new",
      seriesTitle: "Spice and Wolf",
      volumeNumber: 1,
      project: null,
    });
  });

  it("previews a file already in the library as a duplicate", async () => {
    const api = setup();
    const book = await api.imported("本");
    expect(await api.preview("本")).toEqual({ kind: "duplicate", book });
  });

  it("respects the reader's project and volume number", async () => {
    const api = setup();
    const witch = await api.imported("魔女の旅々 1");
    const moved = await api.imported("Spice and Wolf 3", {
      projectId: witch.projectId ?? "",
      volumeNumber: 2.5,
    });
    expect(moved).toMatchObject({ projectId: witch.projectId, volumeNumber: 2.5 });

    const separate = await api.imported("魔女の旅々 2", {
      projectName: "Witch side stories",
      volumeNumber: 9,
    });
    expect(separate.projectId).not.toBe(witch.projectId);
    expect((await api.project(separate.projectId ?? "")).name).toBe("Witch side stories");
    expect(separate.volumeNumber).toBe(9);
  });

  it("numbers unnumbered books 1 when free, else after the highest volume", async () => {
    const api = setup();
    const three = await api.imported("魔女の旅々 3");
    const projectId = three.projectId ?? "";
    const first = await api.imported("Extras", { projectId, volumeNumber: null });
    expect(first.volumeNumber).toBe(1);
    const next = await api.imported("More extras", { projectId, volumeNumber: null });
    expect(next.volumeNumber).toBe(4);
  });

  it("rejects an invalid placement and an unknown project", async () => {
    const api = setup();
    const bad = await api.app.request("/api/books", {
      method: "POST",
      body: (() => {
        const body = new FormData();
        body.append("file", new File([`${MAGIC}本`], "book.epub"));
        body.append("placement", "{not json");
        return body;
      })(),
    });
    expect(bad.status).toBe(400);
    const unknown = await api.upload("本", { projectId: "nope", volumeNumber: 1 });
    expect(unknown.status).toBe(404);
    expect(await api.projects()).toEqual([]);
  });

  it("editing a volume number reorders the project page", async () => {
    const api = setup();
    const one = await api.imported("魔女の旅々 1");
    const two = await api.imported("魔女の旅々 2");
    const projectId = one.projectId ?? "";
    expect((await api.project(projectId)).books.map((b) => b.id)).toEqual([one.id, two.id]);

    const res = await api.send("PATCH", `/api/books/${one.id}/volume`, { volumeNumber: 3 });
    expect(res.status).toBe(200);
    expect(BookSummarySchema.parse(await res.json()).volumeNumber).toBe(3);
    expect((await api.project(projectId)).books.map((b) => b.id)).toEqual([two.id, one.id]);

    expect(
      (await api.send("PATCH", `/api/books/${one.id}/volume`, { volumeNumber: -1 })).status,
    ).toBe(400);
    expect((await api.send("PATCH", "/api/books/nope/volume", { volumeNumber: 1 })).status).toBe(
      404,
    );
  });
});
