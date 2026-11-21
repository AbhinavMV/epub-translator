import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_OWNER_ID } from "@et/contracts";
import type { ParsedBook, StoredBook } from "@et/core";
import { PostgresStoreFactory } from "@et/store-postgres";
import { ALICE, BOB, createTestDatabase } from "@et/store-postgres/testing";
import { openDatabase, SqliteStoreFactory } from "@et/store-sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { postgresBackfill, runProjectBackfill, sqliteBackfill } from "../src/backfill-projects.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [],
  segments: [],
};

const unplaced = (id: string, title: string): StoredBook => ({
  id,
  sha256: id,
  title,
  author: null,
  sourceLang: "ja",
  coverHref: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  projectId: null,
  volumeNumber: null,
});

let counter = 0;
const ids = { next: () => `p${++counter}` };

describe("project backfill on SQLite", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function seededFile() {
    dir = mkdtempSync(join(tmpdir(), "et-backfill-"));
    const path = join(dir, "translator.db");
    const db = openDatabase(path);
    const repos = new SqliteStoreFactory(db).forOwner(LOCAL_OWNER_ID);
    await repos.books.insert(unplaced("a1", "魔女の旅々 1"), parsed);
    await repos.books.insert(unplaced("a2", "魔女の旅々 2"), parsed);
    db.close();
    return path;
  }

  async function projectsIn(path: string) {
    const db = openDatabase(path);
    const repos = new SqliteStoreFactory(db).forOwner(LOCAL_OWNER_ID);
    const projects = await repos.projects.list();
    const books = await repos.books.list();
    db.close();
    return { projects: projects.map((p) => p.name), unplaced: books.filter((b) => !b.projectId) };
  }

  it("dry run prints the proposal and leaves the file untouched", async () => {
    const path = await seededFile();
    const lines: string[] = [];
    await runProjectBackfill(sqliteBackfill(path, { apply: false }), {
      apply: false,
      ids,
      log: (l) => lines.push(l),
    });
    expect(lines.join("\n")).toContain('New project "魔女の旅々"');
    expect(lines.join("\n")).toContain("vol 2  魔女の旅々 2");
    expect(lines.at(-1)).toMatch(/dry run/i);
    expect(await projectsIn(path)).toMatchObject({ projects: [], unplaced: { length: 2 } });
  });

  it("apply writes once and a second apply changes nothing", async () => {
    const path = await seededFile();
    const run = () =>
      runProjectBackfill(sqliteBackfill(path, { apply: true }), {
        apply: true,
        ids,
        log: () => {},
      });
    await run();
    expect(await projectsIn(path)).toEqual({ projects: ["魔女の旅々"], unplaced: [] });
    const lines: string[] = [];
    await runProjectBackfill(sqliteBackfill(path, { apply: true }), {
      apply: true,
      ids,
      log: (l) => lines.push(l),
    });
    expect(lines).toContain("Every book already belongs to a project.");
    expect(await projectsIn(path)).toEqual({ projects: ["魔女の旅々"], unplaced: [] });
  });
});

describe("project backfill on Postgres", () => {
  it("plans and applies per owner through the store ports", async () => {
    const { db, sql } = await createTestDatabase();
    const factory = new PostgresStoreFactory(sql);
    await factory.forOwner(ALICE).books.insert(unplaced("a1", "Index Vol. 1"), parsed);
    await factory.forOwner(BOB).books.insert(unplaced("b1", "Index Vol. 3"), parsed);

    const dry: string[] = [];
    await runProjectBackfill(await postgresBackfill(sql), {
      apply: false,
      ids,
      log: (l) => dry.push(l),
    });
    expect(dry).toContain(`Owner ${ALICE}`);
    expect(dry).toContain(`Owner ${BOB}`);
    expect(await factory.forOwner(ALICE).projects.list()).toEqual([]);

    await runProjectBackfill(await postgresBackfill(sql), { apply: true, ids, log: () => {} });
    const [bobProject] = await factory.forOwner(BOB).projects.list();
    expect(bobProject?.name).toBe("Index");
    expect(await factory.forOwner(BOB).books.listByProject(bobProject?.id ?? "")).toMatchObject([
      { id: "b1", volumeNumber: 3 },
    ]);

    const again: string[] = [];
    await runProjectBackfill(await postgresBackfill(sql), {
      apply: true,
      ids,
      log: (l) => again.push(l),
    });
    expect(again.filter((l) => l.startsWith("Every book"))).toHaveLength(2);
    await db.close();
  });
});
