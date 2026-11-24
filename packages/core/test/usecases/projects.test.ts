import { describe, expect, it } from "vitest";
import {
  importBook,
  listProjectOverviews,
  listProjects,
  moveBook,
  NotFoundError,
  projectOverview,
  renameProject,
  requireProject,
} from "../../src/index.ts";
import {
  counterIds,
  fakeHasher,
  MemoryBlobs,
  MemoryBooks,
  MemoryJobs,
  MemoryProjects,
  MemoryTranslations,
  StubParser,
  sampleParsed,
} from "./fakes.ts";

function library() {
  return {
    books: new MemoryBooks(),
    projects: new MemoryProjects(),
    blobs: new MemoryBlobs(),
    hasher: fakeHasher,
    ids: counterIds("id"),
    clock: { now: () => new Date("2026-10-23T00:00:00.000Z") },
  };
}

async function importTitled(deps: ReturnType<typeof library>, title: string, byte: number) {
  return importBook(
    { ...deps, parser: new StubParser({ ...sampleParsed, title }) },
    new Uint8Array([byte]),
  );
}

describe("listProjects", () => {
  it("lists every project with its books in volume order, empty ones included", async () => {
    const deps = library();
    const one = await importTitled(deps, "魔女の旅々 2", 1);
    const two = await importTitled(deps, "Spice and Wolf 1", 2);
    await deps.books.place(two.id, one.projectId ?? "", 1);
    await deps.projects.create({ id: "empty", name: "Empty", createdAt: "2026-10-01" });

    const projects = await listProjects(deps);
    const byId = Object.fromEntries(projects.map((p) => [p.project.id, p.books]));
    expect(byId[one.projectId ?? ""]?.map((b) => b.id)).toEqual([two.id, one.id]);
    expect(byId[two.projectId ?? ""]).toEqual([]);
    expect(byId.empty).toEqual([]);
  });
});

describe("project overviews", () => {
  it("name the language every volume is fully translated into, in the list and for one project", async () => {
    const deps = { ...library(), jobs: new MemoryJobs(), translations: new MemoryTranslations() };
    const book = await importTitled(deps, "本 1", 1);
    await deps.jobs.insert({
      id: "j1",
      bookId: book.id,
      targetLang: "fr",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "",
    });
    for (const s of sampleParsed.segments) {
      await deps.translations.put("j1", s.id, { text: "t", status: "done" });
    }
    const [overview] = await listProjectOverviews(deps);
    const progress = { fullyTranslatedLang: "fr", mainLang: "fr", translatedVolumeCount: 1 };
    expect(overview).toMatchObject({ books: [book], progress });
    expect(await projectOverview(deps, book.projectId ?? "")).toMatchObject({
      project: overview?.project,
      progress,
      volumes: new Map([[book.id, { completeLangs: ["fr"], translatedPercent: 100 }]]),
    });
    await expect(projectOverview(deps, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("requireProject", () => {
  it("returns the project and its books, or throws NotFoundError", async () => {
    const deps = library();
    const book = await importTitled(deps, "本 3", 1);
    const { project, books } = await requireProject(deps, book.projectId ?? "");
    expect(project.name).toBe("本");
    expect(books).toEqual([book]);
    await expect(requireProject(deps, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("renameProject", () => {
  it("trims the new name and allows duplicates", async () => {
    const deps = library();
    const a = await importTitled(deps, "A", 1);
    await importTitled(deps, "B", 2);
    const renamed = await renameProject(deps, a.projectId ?? "", "  B  ");
    expect(renamed.name).toBe("B");
    expect((await deps.projects.list()).map((p) => p.name)).toEqual(["B", "B"]);
  });

  it("throws NotFoundError for an unknown project", async () => {
    await expect(renameProject(library(), "missing", "x")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("moveBook", () => {
  it("gives a project without a series title the moved book's series", async () => {
    const deps = library();
    const book = await importTitled(deps, "魔女の旅々 3", 1);
    await deps.projects.create({ id: "blank", name: "Blank", createdAt: "2026-10-24" });
    await moveBook(deps, book.id, "blank");
    expect(await deps.projects.seriesTitle("blank")).toBe("魔女の旅々");
  });
});
