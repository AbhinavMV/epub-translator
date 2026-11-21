import {
  BookSummarySchema,
  type ImportPlacement,
  ImportPreviewSchema,
  JobSummarySchema,
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
  const imported = async (title: string, placement?: ImportPlacement) => {
    const res = await app.request("/api/books", { method: "POST", body: form(title, placement) });
    expect(res.status).toBe(201);
    return BookSummarySchema.parse(await res.json());
  };
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
  const project = async (id: string) =>
    ProjectDetailSchema.parse(await (await app.request(`/api/projects/${id}`)).json());
  const projects = async () =>
    z.array(ProjectSummarySchema).parse(await (await app.request("/api/projects")).json());
  const move = (bookId: string, projectId: string) =>
    send("PATCH", `/api/books/${bookId}/project`, { projectId });

  return { app, services, form, imported, send, project, projects, move };
}

describe("move a book to another project", () => {
  it("re-parses its volume number from its title and lists it in volume order", async () => {
    const { imported, project, move } = setup();
    const one = await imported("魔女の旅々 1");
    const two = await imported("魔女の旅々 2");
    const stray = await imported("Wandering Witch 3");
    expect(stray.projectId).not.toBe(one.projectId);

    const res = await move(stray.id, one.projectId ?? "");
    expect(res.status).toBe(200);
    expect(BookSummarySchema.parse(await res.json())).toMatchObject({
      id: stray.id,
      projectId: one.projectId,
      volumeNumber: 3,
    });
    const detail = await project(one.projectId ?? "");
    expect(detail.books.map((b) => [b.id, b.volumeNumber])).toEqual([
      [one.id, 1],
      [two.id, 2],
      [stray.id, 3],
    ]);
  });

  it("falls back to the next unnumbered volume and drops a hand-edited number", async () => {
    const { imported, project, move, send } = setup();
    const one = await imported("魔女の旅々 1");
    await imported("魔女の旅々 4.5");
    const untitled = await imported("Side Story");
    expect(
      (await send("PATCH", `/api/books/${untitled.id}/volume`, { volumeNumber: 9 })).status,
    ).toBe(200);

    expect((await move(untitled.id, one.projectId ?? "")).status).toBe(200);
    const detail = await project(one.projectId ?? "");
    expect(detail.books.map((b) => b.volumeNumber)).toEqual([1, 4.5, 5]);
  });

  it("keeps the book's translations", async () => {
    const { app, services, imported, move } = setup();
    const one = await imported("魔女の旅々 1");
    const stray = await imported("Other 2");
    const workspace = JobSummarySchema.parse(
      await (await app.request(`/api/books/${stray.id}/workspace?targetLang=en`)).json(),
    );
    await services.repos.translations.put(workspace.id, "opf#title", {
      text: "Other Two",
      status: "done",
    });

    const moved = BookSummarySchema.parse(await (await move(stray.id, one.projectId ?? "")).json());
    expect(moved.translatedTitle).toBe("Other Two");
    const again = JobSummarySchema.parse(
      await (await app.request(`/api/books/${stray.id}/workspace?targetLang=en`)).json(),
    );
    expect(again.id).toBe(workspace.id);
    expect(again.titles.book).toBe("Other Two");
  });

  it("404s an unknown book or project and rejects a missing project id", async () => {
    const { imported, move, send } = setup();
    const one = await imported("魔女の旅々 1");
    expect((await move("nope", one.projectId ?? "")).status).toBe(404);
    expect((await move(one.id, "nope")).status).toBe(404);
    expect((await send("PATCH", `/api/books/${one.id}/project`, {})).status).toBe(400);
  });

  it("leaves the emptied source project in place", async () => {
    const { imported, project, move } = setup();
    const one = await imported("魔女の旅々 1");
    const stray = await imported("Other 2");
    await move(stray.id, one.projectId ?? "");
    const source = await project(stray.projectId ?? "");
    expect(source.books).toEqual([]);
  });
});

describe("delete a project", () => {
  it("removes the project with its books, their jobs, translations and blobs", async () => {
    const { app, services, imported, projects, send } = setup();
    const one = await imported("魔女の旅々 1");
    const two = await imported("魔女の旅々 2");
    const other = await imported("Other 1");
    const job = JobSummarySchema.parse(
      await (await app.request(`/api/books/${one.id}/workspace?targetLang=en`)).json(),
    );

    const stored = await services.repos.books.get(one.id);
    const blobKey = `books/${stored?.sha256}.epub`;
    expect(await services.blobs.get(blobKey)).toBeDefined();

    const res = await send("DELETE", `/api/projects/${one.projectId}`);
    expect(res.status).toBe(204);

    expect((await app.request(`/api/projects/${one.projectId}`)).status).toBe(404);
    expect((await app.request(`/api/books/${one.id}`)).status).toBe(404);
    expect((await app.request(`/api/books/${two.id}`)).status).toBe(404);
    expect((await app.request(`/api/jobs/${job.id}`)).status).toBe(404);
    await expect(services.blobs.get(blobKey)).rejects.toThrow();
    expect((await projects()).map((p) => p.id)).toEqual([other.projectId]);
    expect((await app.request(`/api/books/${other.id}`)).status).toBe(200);

    const again = await imported("魔女の旅々 1");
    expect(again.id).not.toBe(one.id);
  });

  it("deletes an empty project and 404s an unknown one", async () => {
    const { imported, move, send, projects } = setup();
    const one = await imported("魔女の旅々 1");
    const stray = await imported("Other 2");
    await move(stray.id, one.projectId ?? "");
    expect((await send("DELETE", `/api/projects/${stray.projectId}`)).status).toBe(204);
    expect((await projects()).map((p) => p.id)).toEqual([one.projectId]);
    expect((await send("DELETE", "/api/projects/nope")).status).toBe(404);
  });
});

describe("delete a project's last book", () => {
  it("leaves the empty project, with its glossary, for the next volume", async () => {
    const { app, form, imported, project, projects, send } = setup();
    const one = await imported("魔女の旅々 1");
    const terms = {
      customPrompt: "Keep honorifics",
      glossary: [{ source: "イレイナ", target: "Elaina" }],
    };
    expect((await send("PUT", `/api/projects/${one.projectId}/settings`, terms)).status).toBe(200);
    expect((await send("DELETE", `/api/books/${one.id}`)).status).toBe(204);

    const settings = await (await app.request(`/api/projects/${one.projectId}/settings`)).json();
    expect(settings).toMatchObject(terms);

    expect((await project(one.projectId ?? "")).books).toEqual([]);
    expect(await projects()).toMatchObject([{ id: one.projectId, volumeCount: 0 }]);
    const preview = ImportPreviewSchema.parse(
      await (
        await app.request("/api/books/preview", { method: "POST", body: form("魔女の旅々 2") })
      ).json(),
    );
    expect(preview).toMatchObject({ kind: "new", project: { id: one.projectId } });
    const next = await imported("魔女の旅々 2");
    expect(next).toMatchObject({ projectId: one.projectId, volumeNumber: 2 });
  });

  it("still suggests the emptied project after it is renamed", async () => {
    const { app, form, imported, send } = setup();
    const one = await imported("魔女の旅々 1");
    expect(
      (await send("PATCH", `/api/projects/${one.projectId}`, { name: "Wandering Witch" })).status,
    ).toBe(200);
    expect((await send("DELETE", `/api/books/${one.id}`)).status).toBe(204);

    const preview = ImportPreviewSchema.parse(
      await (
        await app.request("/api/books/preview", { method: "POST", body: form("魔女の旅々 2") })
      ).json(),
    );
    expect(preview).toMatchObject({
      kind: "new",
      project: { id: one.projectId, name: "Wandering Witch" },
    });
    const next = await imported("魔女の旅々 2");
    expect(next).toMatchObject({ projectId: one.projectId, volumeNumber: 2 });
  });

  it("suggests a project created under another name by the series it was made from", async () => {
    const { app, form, imported, send } = setup();
    const one = await imported("魔女の旅々 1", { projectName: "Elaina", volumeNumber: null });
    expect((await send("DELETE", `/api/books/${one.id}`)).status).toBe(204);

    const preview = ImportPreviewSchema.parse(
      await (
        await app.request("/api/books/preview", { method: "POST", body: form("魔女の旅々 2") })
      ).json(),
    );
    expect(preview).toMatchObject({ kind: "new", project: { id: one.projectId, name: "Elaina" } });
  });
});
