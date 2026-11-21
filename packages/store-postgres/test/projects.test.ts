import type { PGlite } from "@electric-sql/pglite";
import type { StoredBook } from "@et/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql } from "../src/index.ts";
import { book, parsed } from "./fixtures.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(() => resetData(db));

const repos = () => new PostgresStoreFactory(sql).forOwner(ALICE);

function storedBook(over: Partial<StoredBook> & Pick<StoredBook, "id">): StoredBook {
  return { ...book, sha256: over.id, ...over };
}

describe("PostgresProjectRepository", () => {
  it("creates, renames and lists projects newest first", async () => {
    const { projects } = repos();
    await projects.create({ id: "p1", name: "A", createdAt: "2026-10-01T00:00:00.000Z" });
    await projects.create({ id: "p2", name: "A", createdAt: "2026-10-02T00:00:00.000Z" });
    await projects.rename("p1", "Renamed");
    expect(await projects.get("p1")).toEqual({
      id: "p1",
      name: "Renamed",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    expect((await projects.list()).map((p) => [p.id, p.name])).toEqual([
      ["p2", "A"],
      ["p1", "Renamed"],
    ]);
    await projects.delete("p2");
    expect(await projects.get("p2")).toBeNull();
  });

  it("keeps each owner's projects apart", async () => {
    await repos().projects.create({ id: "p1", name: "A", createdAt: "2026-10-01T00:00:00.000Z" });
    const bob = new PostgresStoreFactory(sql).forOwner(BOB);
    expect(await bob.projects.list()).toEqual([]);
    expect(await bob.projects.get("p1")).toBeNull();
    await bob.projects.rename("p1", "pwned");
    expect((await repos().projects.get("p1"))?.name).toBe("A");
  });
});

describe("books by project", () => {
  it("lists a project's books in volume order, ties by import date", async () => {
    const { projects, books } = repos();
    await projects.create({ id: "p1", name: "A", createdAt: "2026-10-01T00:00:00.000Z" });
    await projects.create({ id: "p2", name: "B", createdAt: "2026-10-01T00:00:00.000Z" });
    await books.insert(storedBook({ id: "v2", projectId: "p1", volumeNumber: 2 }), parsed);
    await books.insert(
      storedBook({
        id: "v1-late",
        projectId: "p1",
        volumeNumber: 1,
        createdAt: "2026-10-30T00:00:00.000Z",
      }),
      parsed,
    );
    await books.insert(storedBook({ id: "v1-early", projectId: "p1", volumeNumber: 1 }), parsed);
    await books.insert(storedBook({ id: "v2.5", projectId: "p1", volumeNumber: 2.5 }), parsed);
    await books.insert(storedBook({ id: "other", projectId: "p2", volumeNumber: 1 }), parsed);
    expect((await books.listByProject("p1")).map((b) => b.id)).toEqual([
      "v1-early",
      "v1-late",
      "v2",
      "v2.5",
    ]);
    expect(await books.get("v2.5")).toMatchObject({ projectId: "p1", volumeNumber: 2.5 });
  });

  it("places an unplaced book in a project", async () => {
    const { projects, books } = repos();
    await projects.create({ id: "p1", name: "A", createdAt: "2026-10-01T00:00:00.000Z" });
    await books.insert(storedBook({ id: "b1" }), parsed);
    expect(await books.get("b1")).toMatchObject({ projectId: null, volumeNumber: null });
    await books.place("b1", "p1", 3);
    expect(await books.listByProject("p1")).toEqual([
      storedBook({ id: "b1", projectId: "p1", volumeNumber: 3 }),
    ]);
  });

  it("refuses a book in a project that does not exist", async () => {
    await expect(
      repos().books.insert(storedBook({ id: "b1", projectId: "nope", volumeNumber: 1 }), parsed),
    ).rejects.toThrow();
  });
});
