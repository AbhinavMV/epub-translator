import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_OWNER_ID } from "@et/contracts";
import type { ParsedBook, Repositories, StoredBook } from "@et/core";
import { PostgresStoreFactory } from "@et/store-postgres";
import { ALICE, BOB, createTestDatabase } from "@et/store-postgres/testing";
import { openDatabase, SqliteStoreFactory } from "@et/store-sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { postgresBackfill, sqliteBackfill } from "../src/backfill-projects.ts";
import { runProjectSettingsMerge } from "../src/merge-project-settings.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [],
  segments: [],
};

const placed = (id: string, volumeNumber: number): StoredBook => ({
  id,
  sha256: id,
  title: `魔女の旅々 ${volumeNumber}`,
  author: null,
  sourceLang: "ja",
  coverHref: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  projectId: "p1",
  volumeNumber,
});

const legacy = (customPrompt: string, target: string) => ({
  customPrompt,
  glossary: [{ source: "灰の魔女", target }],
  provider: null,
  model: null,
});

async function seed(
  repos: Repositories,
  putLegacy: (bookId: string, json: object) => Promise<void>,
) {
  await repos.projects.create({ id: "p1", name: "魔女の旅々", createdAt: "2026-10-01T00:00:00Z" });
  await repos.books.insert(placed("v1", 1), parsed);
  await repos.books.insert(placed("v2", 2), parsed);
  await putLegacy("v1", legacy("Keep honorifics.", "Witch of Ashes"));
  await putLegacy("v2", legacy("", "Ashen Witch"));
}

const merged = {
  customPrompt: "Keep honorifics.",
  glossary: [{ source: "灰の魔女", target: "Ashen Witch" }],
  glossaryConflicts: [
    {
      source: "灰の魔女",
      inForce: { target: "Ashen Witch", bookId: "v2", volumeNumber: 2 },
      alternatives: [{ target: "Witch of Ashes", bookId: "v1", volumeNumber: 1 }],
    },
  ],
};

describe("project settings merge on SQLite", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function seededFile() {
    dir = mkdtempSync(join(tmpdir(), "et-merge-"));
    const path = join(dir, "translator.db");
    const db = openDatabase(path);
    await seed(new SqliteStoreFactory(db).forOwner(LOCAL_OWNER_ID), async (bookId, json) => {
      db.prepare("INSERT INTO book_settings (book_id, json) VALUES (?, ?)").run(
        bookId,
        JSON.stringify(json),
      );
    });
    db.close();
    return path;
  }

  async function read(path: string) {
    const db = openDatabase(path);
    const repos = new SqliteStoreFactory(db).forOwner(LOCAL_OWNER_ID);
    const result = {
      project: await repos.projectSettings.get("p1"),
      v1: await repos.settings.getLegacyTerms("v1"),
    };
    db.close();
    return result;
  }

  it("dry run lists the merged glossary and conflicts and writes nothing", async () => {
    const path = await seededFile();
    const lines: string[] = [];
    await runProjectSettingsMerge(sqliteBackfill(path, { apply: false }), {
      apply: false,
      log: (l) => lines.push(l),
    });
    const out = lines.join("\n");
    expect(out).toContain("灰の魔女 → Ashen Witch");
    expect(out).toContain("Witch of Ashes (vol 1)");
    expect(lines.at(-1)).toMatch(/dry run/i);
    expect((await read(path)).project).toBeNull();
  });

  it("apply writes the project settings, keeps the books' terms, and a re-run keeps edits", async () => {
    const path = await seededFile();
    const apply = (log: (l: string) => void = () => {}) =>
      runProjectSettingsMerge(sqliteBackfill(path, { apply: true }), { apply: true, log });
    await apply();
    expect(await read(path)).toEqual({
      project: merged,
      v1: {
        customPrompt: "Keep honorifics.",
        glossary: [{ source: "灰の魔女", target: "Witch of Ashes" }],
      },
    });

    const db = openDatabase(path);
    await new SqliteStoreFactory(db)
      .forOwner(LOCAL_OWNER_ID)
      .projectSettings.put("p1", { ...merged, glossaryConflicts: [] });
    db.close();

    const lines: string[] = [];
    await apply((l) => lines.push(l));
    expect(lines.join("\n")).toContain("skipped");
    expect((await read(path)).project?.glossaryConflicts).toEqual([]);
  });
});

describe("project settings merge on Postgres", () => {
  it("merges per owner and skips on a re-run", async () => {
    const { db, sql } = await createTestDatabase();
    const factory = new PostgresStoreFactory(sql);
    for (const owner of [ALICE, BOB]) {
      await seed(factory.forOwner(owner), async (bookId, json) => {
        await sql.query(
          "insert into book_settings (owner_id, book_id, json) values ($1, $2, $3::text::jsonb)",
          [owner, bookId, JSON.stringify(json)],
        );
      });
    }

    await runProjectSettingsMerge(postgresBackfill(sql), { apply: false, log: () => {} });
    expect(await factory.forOwner(ALICE).projectSettings.get("p1")).toBeNull();

    await runProjectSettingsMerge(postgresBackfill(sql), { apply: true, log: () => {} });
    expect(await factory.forOwner(BOB).projectSettings.get("p1")).toEqual(merged);
    expect(await factory.forOwner(ALICE).settings.getLegacyTerms("v2")).toEqual({
      customPrompt: "",
      glossary: [{ source: "灰の魔女", target: "Ashen Witch" }],
    });

    const again: string[] = [];
    await runProjectSettingsMerge(postgresBackfill(sql), {
      apply: true,
      log: (l) => again.push(l),
    });
    expect(again.filter((l) => l.includes("skipped"))).toHaveLength(2);
    await db.close();
  });
});
