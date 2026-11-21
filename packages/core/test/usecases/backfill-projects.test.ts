import { describe, expect, it } from "vitest";
import { backfillProjects, type StoredBook } from "../../src/index.ts";
import { counterIds, MemoryBooks, MemoryProjects, sampleParsed } from "./fakes.ts";

function unplaced(id: string, title: string, createdAt = `2026-10-0${id.length}T00:00:00.000Z`) {
  const book: StoredBook = {
    id,
    sha256: id,
    title,
    author: null,
    sourceLang: "ja",
    coverHref: null,
    createdAt,
    projectId: null,
    volumeNumber: null,
  };
  return book;
}

async function library(...books: StoredBook[]) {
  const deps = { books: new MemoryBooks(), projects: new MemoryProjects(), ids: counterIds("p") };
  for (const book of books) await deps.books.insert(book, sampleParsed);
  return deps;
}

async function placements(deps: Awaited<ReturnType<typeof library>>) {
  const result: Record<string, [string, number | null][]> = {};
  for (const project of await deps.projects.list()) {
    result[project.name] = (await deps.books.listByProject(project.id)).map((b) => [
      b.id,
      b.volumeNumber,
    ]);
  }
  return result;
}

describe("backfillProjects", () => {
  it("dry run proposes projects and volume numbers without writing anything", async () => {
    const deps = await library(
      unplaced("a2", "魔女の旅々 2"),
      unplaced("a1", "魔女の旅々"),
      unplaced("b", "本好きの下剋上 第3巻"),
    );
    const plan = await backfillProjects(deps, { apply: false });
    expect(plan.projects).toEqual([
      {
        projectId: null,
        name: "本好きの下剋上",
        books: [{ bookId: "b", title: "本好きの下剋上 第3巻", volumeNumber: 3 }],
      },
      {
        projectId: null,
        name: "魔女の旅々",
        books: [
          { bookId: "a1", title: "魔女の旅々", volumeNumber: 1 },
          { bookId: "a2", title: "魔女の旅々 2", volumeNumber: 2 },
        ],
      },
    ]);
    expect(await deps.projects.list()).toEqual([]);
    expect((await deps.books.get("a1"))?.projectId).toBeNull();
  });

  it("apply groups books by series title and a second apply changes nothing", async () => {
    const deps = await library(
      unplaced("a2", "魔女の旅々 2"),
      unplaced("a1", "魔女の旅々"),
      unplaced("b", "本好きの下剋上 第3巻"),
    );
    await backfillProjects(deps, { apply: true });
    const after = await placements(deps);
    expect(after).toEqual({
      魔女の旅々: [
        ["a1", 1],
        ["a2", 2],
      ],
      本好きの下剋上: [["b", 3]],
    });
    const again = await backfillProjects(deps, { apply: true });
    expect(again.projects).toEqual([]);
    expect(await placements(deps)).toEqual(after);
  });

  it("names the project after the series title and dates it from its first volume", async () => {
    const deps = await library(
      unplaced("x2", "Index Vol. 2", "2026-10-05T00:00:00.000Z"),
      unplaced("x1", "Index Vol. 1", "2026-10-02T00:00:00.000Z"),
    );
    await backfillProjects(deps, { apply: true });
    expect(await deps.projects.list()).toEqual([
      { id: "p1", name: "Index", createdAt: "2026-10-02T00:00:00.000Z" },
    ]);
  });

  it("puts a book left unplaced by an interrupted apply into its series' project", async () => {
    const deps = await library(unplaced("a1", "魔女の旅々 1"), unplaced("a2", "魔女の旅々 2"));
    await deps.projects.create({ id: "existing", name: "Renamed", createdAt: "2026-10-01" });
    await deps.books.place("a1", "existing", 1);
    const plan = await backfillProjects(deps, { apply: true });
    expect(plan.projects).toEqual([
      {
        projectId: "existing",
        name: "Renamed",
        books: [{ bookId: "a2", title: "魔女の旅々 2", volumeNumber: 2 }],
      },
    ]);
    expect(await placements(deps)).toEqual({
      Renamed: [
        ["a1", 1],
        ["a2", 2],
      ],
    });
  });

  it("falls back to the book title when the title is only a volume marker", async () => {
    const deps = await library(unplaced("n", "第2巻"));
    const plan = await backfillProjects(deps, { apply: false });
    expect(plan.projects[0]).toMatchObject({ name: "第2巻", books: [{ volumeNumber: 2 }] });
  });
});
