import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_OWNER_ID } from "@et/contracts";
import type { ParsedBook } from "@et/core";
import { applyMigrations, loadMigrations, PostgresStoreFactory } from "@et/store-postgres";
import { ALICE, BOB, createTestDatabase } from "@et/store-postgres/testing";
import { openDatabase, SqliteStoreFactory } from "@et/store-sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { runProjectBackfill } from "../src/backfill-projects.ts";
import { postgresTarget, sqliteTarget } from "../src/compose-scripts.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [],
  segments: [],
};

const LEGACY_BOOK =
  "insert into books (owner_id, id, sha256, title, source_lang, created_at, parsed_json) values ($4, $1, $1, $2, 'ja', '2026-10-01T00:00:00.000Z', $3)";

let counter = 0;
const ids = { next: () => `p${++counter}` };

describe("project backfill on SQLite", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function seededFile() {
    dir = mkdtempSync(join(tmpdir(), "et-backfill-"));
    const path = join(dir, "translator.db");
    const db = openDatabase(path);
    const insert = db.prepare(
      "insert into books (id, sha256, title, source_lang, created_at, parsed_json) values (?, ?, ?, 'ja', '2026-10-01T00:00:00.000Z', ?)",
    );
    insert.run("a1", "a1", "魔女の旅々 1", JSON.stringify(parsed));
    insert.run("a2", "a2", "魔女の旅々 2", JSON.stringify(parsed));
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
    await runProjectBackfill(sqliteTarget(path, { apply: false }), {
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
      runProjectBackfill(sqliteTarget(path, { apply: true }), {
        apply: true,
        ids,
        log: () => {},
      });
    await run();
    expect(await projectsIn(path)).toEqual({ projects: ["魔女の旅々"], unplaced: [] });
    const lines: string[] = [];
    await runProjectBackfill(sqliteTarget(path, { apply: true }), {
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
    const { db, sql } = await createTestDatabase({ before: "0012" });
    const factory = new PostgresStoreFactory(sql);
    await sql.query(LEGACY_BOOK, ["a1", "Index Vol. 1", JSON.stringify(parsed), ALICE]);
    await sql.query(LEGACY_BOOK, ["b1", "Index Vol. 3", JSON.stringify(parsed), BOB]);
    const required = loadMigrations().filter((m) => m.name.startsWith("0012"));
    await expect(applyMigrations(sql, required)).rejects.toThrow();

    const dry: string[] = [];
    await runProjectBackfill(postgresTarget(sql), {
      apply: false,
      ids,
      log: (l) => dry.push(l),
    });
    expect(dry).toContain(`Owner ${ALICE}`);
    expect(dry).toContain(`Owner ${BOB}`);
    expect(await factory.forOwner(ALICE).projects.list()).toEqual([]);

    await runProjectBackfill(postgresTarget(sql), { apply: true, ids, log: () => {} });
    const [bobProject] = await factory.forOwner(BOB).projects.list();
    expect(bobProject?.name).toBe("Index");
    expect(await factory.forOwner(BOB).books.listByProject(bobProject?.id ?? "")).toMatchObject([
      { id: "b1", volumeNumber: 3 },
    ]);

    const again: string[] = [];
    await runProjectBackfill(postgresTarget(sql), {
      apply: true,
      ids,
      log: (l) => again.push(l),
    });
    expect(again.filter((l) => l.startsWith("Every book"))).toHaveLength(2);
    expect(await factory.forOwner(BOB).projects.findBySeriesTitle("Index")).toEqual(bobProject);
    expect(await applyMigrations(sql, required)).toEqual(["0012_books_project_required.sql"]);
    await db.close();
  });
});
