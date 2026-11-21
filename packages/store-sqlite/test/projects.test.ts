import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ParsedBook, type StoredBook, UnplacedBookError } from "@et/core";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Database,
  migrate,
  openDatabase,
  openDatabaseSnapshot,
  SCHEMA_VERSION,
  SqliteBookRepository,
  SqliteJobRepository,
  SqliteProjectRepository,
  SqliteTranslationRepository,
  schemaVersion,
} from "../src/index.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "第一章", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "こんにちは" }],
};

function storedBook(over: Partial<StoredBook> & Pick<StoredBook, "id">): StoredBook {
  return {
    sha256: over.id,
    title: "本",
    author: null,
    sourceLang: "ja",
    coverHref: null,
    createdAt: "2026-10-23T00:00:00.000Z",
    projectId: null,
    volumeNumber: null,
    ...over,
  };
}

let db: Database;
beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("SqliteProjectRepository", () => {
  it("keeps the first series title it adopts and finds the project by it", async () => {
    const projects = new SqliteProjectRepository(db);
    await projects.create({ id: "p1", name: "魔女の旅々", createdAt: "2026-10-01T00:00:00.000Z" });
    expect(await projects.seriesTitle("p1")).toBeNull();
    expect(await projects.findBySeriesTitle("魔女の旅々")).toBeNull();
    await projects.adoptSeriesTitle("p1", "魔女の旅々");
    await projects.adoptSeriesTitle("p1", "Spice and Wolf");
    await projects.rename("p1", "Wandering Witch");
    expect(await projects.seriesTitle("p1")).toBe("魔女の旅々");
    expect(await projects.findBySeriesTitle("魔女の旅々")).toEqual({
      id: "p1",
      name: "Wandering Witch",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    expect(await projects.findBySeriesTitle("Spice and Wolf")).toBeNull();
  });

  it("creates, renames and lists projects newest first", async () => {
    const projects = new SqliteProjectRepository(db);
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
});

describe("books by project", () => {
  it("lists a project's books in volume order, ties by import date", async () => {
    const projects = new SqliteProjectRepository(db);
    const books = new SqliteBookRepository(db);
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
    const projects = new SqliteProjectRepository(db);
    const books = new SqliteBookRepository(db);
    await projects.create({ id: "p1", name: "A", createdAt: "2026-10-01T00:00:00.000Z" });
    db.prepare(
      "INSERT INTO books (id, sha256, title, source_lang, created_at, parsed_json) VALUES ('b1', 'b1', '本', 'ja', ?, ?)",
    ).run("2026-10-23T00:00:00.000Z", JSON.stringify(parsed));
    expect(await books.get("b1")).toMatchObject({ projectId: null, volumeNumber: null });
    await books.place("b1", "p1", 3);
    expect(await books.listByProject("p1")).toEqual([
      storedBook({ id: "b1", projectId: "p1", volumeNumber: 3 }),
    ]);
  });

  it("refuses a book without a project, though the column stays nullable", async () => {
    const books = new SqliteBookRepository(db);
    await expect(books.insert(storedBook({ id: "b1" }), parsed)).rejects.toBeInstanceOf(
      UnplacedBookError,
    );
    await expect(books.insertIfAbsent(storedBook({ id: "b1" }), parsed)).rejects.toBeInstanceOf(
      UnplacedBookError,
    );
    expect(await books.list()).toEqual([]);
  });

  it("refuses a book in a project that does not exist", async () => {
    const books = new SqliteBookRepository(db);
    await expect(
      books.insert(storedBook({ id: "b1", projectId: "nope", volumeNumber: 1 }), parsed),
    ).rejects.toThrow();
  });
});

describe("projects migration", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("counts the segments of books stored before segments were counted", async () => {
    const old = new BetterSqlite3(":memory:");
    migrate(old, SCHEMA_VERSION - 1);
    old
      .prepare(
        "INSERT INTO books (id, sha256, title, created_at, parsed_json) VALUES ('b1', 's', '本 2', '2026-10-01T00:00:00.000Z', ?)",
      )
      .run(JSON.stringify(parsed));
    migrate(old);
    expect(await new SqliteBookRepository(old).segmentCounts(["b1"])).toEqual(new Map([["b1", 1]]));
    old.close();
  });

  it("keeps existing books, jobs and translations and leaves them unplaced", async () => {
    dir = mkdtempSync(join(tmpdir(), "et-projects-"));
    const path = join(dir, "translator.db");
    const old = new BetterSqlite3(path);
    old.pragma("foreign_keys = ON");
    migrate(old, 4);
    old
      .prepare(
        "INSERT INTO books (id, sha256, title, created_at, parsed_json) VALUES ('b1', 's', '本 2', '2026-10-01T00:00:00.000Z', ?)",
      )
      .run(JSON.stringify(parsed));
    old
      .prepare(
        "INSERT INTO jobs (id, book_id, target_lang, created_at) VALUES ('j1', 'b1', 'en', '2026-10-01T00:00:00.000Z')",
      )
      .run();
    old
      .prepare(
        "INSERT INTO translations (job_id, segment_id, text, status) VALUES ('j1', 'a.xhtml#0', 'Hello', 'done')",
      )
      .run();
    old.close();

    const upgraded = openDatabase(path);
    expect(await new SqliteBookRepository(upgraded).get("b1")).toMatchObject({
      title: "本 2",
      projectId: null,
      volumeNumber: null,
    });
    expect(await new SqliteJobRepository(upgraded).get("j1")).not.toBeNull();
    expect((await new SqliteTranslationRepository(upgraded).get("j1", "a.xhtml#0"))?.text).toBe(
      "Hello",
    );
    upgraded.close();
  });

  it("snapshots an older file into a migrated in-memory copy without touching the file", async () => {
    dir = mkdtempSync(join(tmpdir(), "et-projects-"));
    const path = join(dir, "translator.db");
    const old = new BetterSqlite3(path);
    old.pragma("journal_mode = WAL");
    migrate(old, 4);
    old
      .prepare(
        "INSERT INTO books (id, sha256, title, created_at, parsed_json) VALUES ('b1', 's', '本 2', '2026-10-01T00:00:00.000Z', ?)",
      )
      .run(JSON.stringify(parsed));
    old.close();

    const copy = openDatabaseSnapshot(path);
    const projects = new SqliteProjectRepository(copy);
    await projects.create({ id: "p1", name: "本", createdAt: "2026-10-01T00:00:00.000Z" });
    await new SqliteBookRepository(copy).place("b1", "p1", 2);
    copy.close();

    const file = new BetterSqlite3(path, { readonly: true });
    expect(schemaVersion(file)).toBe(4);
    expect(file.prepare("SELECT name FROM sqlite_master WHERE name = 'projects'").all()).toEqual(
      [],
    );
    file.close();
  });
});
