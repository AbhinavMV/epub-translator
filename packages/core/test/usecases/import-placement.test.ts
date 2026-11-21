import { describe, expect, it } from "vitest";
import { importBook, NotFoundError, previewImport, renameProject } from "../../src/index.ts";
import {
  counterIds,
  fakeHasher,
  MemoryBlobs,
  MemoryBooks,
  MemoryProjects,
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

type Library = ReturnType<typeof library>;
const titled = (deps: Library, title: string) => ({
  ...deps,
  parser: new StubParser({ ...sampleParsed, title }),
});

describe("previewImport", () => {
  it("suggests the project whose books share the series title, even after a rename", async () => {
    const deps = library();
    const first = await importBook(titled(deps, "魔女の旅々 1"), new Uint8Array([1]));
    await renameProject(deps, first.projectId ?? "", "Wandering Witch");

    const preview = await previewImport(titled(deps, "魔女の旅々 2"), new Uint8Array([2]));
    expect(preview).toEqual({
      kind: "new",
      title: "魔女の旅々 2",
      seriesTitle: "魔女の旅々",
      volumeNumber: 2,
      project: { id: first.projectId, name: "Wandering Witch", createdAt: first.createdAt },
    });
  });

  it("suggests a new project for an unrelated book, even one sharing a project's name", async () => {
    const deps = library();
    const first = await importBook(titled(deps, "魔女の旅々 1"), new Uint8Array([1]));
    await renameProject(deps, first.projectId ?? "", "Spice and Wolf");

    const preview = await previewImport(titled(deps, "Spice and Wolf"), new Uint8Array([2]));
    expect(preview).toMatchObject({ kind: "new", seriesTitle: "Spice and Wolf", project: null });
  });

  it("reports a file already in the library without parsing it", async () => {
    const deps = library();
    const book = await importBook(titled(deps, "本"), new Uint8Array([1]));
    const again = titled(deps, "本");
    expect(await previewImport(again, new Uint8Array([1]))).toEqual({ kind: "duplicate", book });
    expect(again.parser.calls).toBe(0);
  });

  it("stores nothing", async () => {
    const deps = library();
    await previewImport(titled(deps, "本"), new Uint8Array([1]));
    expect(await deps.books.list()).toEqual([]);
    expect(await deps.projects.list()).toEqual([]);
    expect(deps.blobs.rows.size).toBe(0);
  });
});

describe("importBook placement", () => {
  it("joins the suggested project when no placement is given", async () => {
    const deps = library();
    const first = await importBook(titled(deps, "魔女の旅々 1"), new Uint8Array([1]));
    const second = await importBook(titled(deps, "魔女の旅々 2"), new Uint8Array([2]));
    expect(second).toMatchObject({ projectId: first.projectId, volumeNumber: 2 });
    expect(await deps.projects.list()).toHaveLength(1);
  });

  it("respects an overridden project and volume number", async () => {
    const deps = library();
    const other = await importBook(titled(deps, "Spice and Wolf"), new Uint8Array([1]));
    const book = await importBook(titled(deps, "魔女の旅々 2"), new Uint8Array([2]), {
      projectId: other.projectId ?? "",
      volumeNumber: 7.5,
    });
    expect(book).toMatchObject({ projectId: other.projectId, volumeNumber: 7.5 });
    expect(await deps.projects.list()).toHaveLength(1);
  });

  it("creates a new project under the given name", async () => {
    const deps = library();
    const first = await importBook(titled(deps, "魔女の旅々 1"), new Uint8Array([1]));
    const book = await importBook(titled(deps, "魔女の旅々 2"), new Uint8Array([2]), {
      projectName: "  Side stories ",
      volumeNumber: null,
    });
    expect(book.projectId).not.toBe(first.projectId);
    expect(await deps.projects.get(book.projectId ?? "")).toMatchObject({ name: "Side stories" });
    expect(book.volumeNumber).toBe(2);
  });

  it("numbers an unnumbered book against the project the reader picked", async () => {
    const deps = library();
    const one = await importBook(titled(deps, "魔女の旅々 1"), new Uint8Array([1]));
    await importBook(titled(deps, "魔女の旅々 3"), new Uint8Array([2]));
    const target = one.projectId ?? "";

    const extra = await importBook(titled(deps, "短編集"), new Uint8Array([3]), {
      projectId: target,
      volumeNumber: null,
    });
    expect(extra.volumeNumber).toBe(4);

    const fresh = await importBook(titled(deps, "Another"), new Uint8Array([4]));
    expect(fresh.volumeNumber).toBe(1);
  });

  it("gives an unnumbered book volume 1 when its project has no volume 1", async () => {
    const deps = library();
    const two = await importBook(titled(deps, "魔女の旅々 2"), new Uint8Array([1]));
    const book = await importBook(titled(deps, "魔女の旅々"), new Uint8Array([2]));
    expect(book).toMatchObject({ projectId: two.projectId, volumeNumber: 1 });
  });

  it("rejects an unknown project without storing anything", async () => {
    const deps = library();
    await expect(
      importBook(titled(deps, "本"), new Uint8Array([1]), { projectId: "nope", volumeNumber: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await deps.books.list()).toEqual([]);
    expect(deps.blobs.rows.size).toBe(0);
  });

  it("keeps the chosen project when a concurrent import of the same file won", async () => {
    const deps = library();
    const existing = await importBook(titled(deps, "Spice and Wolf"), new Uint8Array([1]));
    const winner = await importBook(titled(deps, "本"), new Uint8Array([2]));
    const lookup = deps.books.findBySha256.bind(deps.books);
    let lookups = 0;
    deps.books.findBySha256 = async (sha) => (lookups++ === 0 ? null : lookup(sha));
    const again = await importBook(titled(deps, "本"), new Uint8Array([2]), {
      projectId: existing.projectId ?? "",
      volumeNumber: 2,
    });
    expect(again.id).toBe(winner.id);
    expect((await deps.projects.list()).map((p) => p.id).sort()).toEqual(
      [existing.projectId, winner.projectId].sort(),
    );
  });
});
