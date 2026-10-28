import type { PGlite } from "@electric-sql/pglite";
import { getOrCreateWorkspace, importBook } from "@et/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql } from "../src/index.ts";
import { book, parsed } from "./fixtures.ts";
import { ALICE, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(() => resetData(db));

function counter() {
  let n = 0;
  return { next: () => `id-${++n}` };
}

async function settled<T>(calls: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(calls);
  const failed = results.filter((r) => r.status === "rejected");
  expect(failed.map((r) => String(r.reason))).toEqual([]);
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

const clock = { now: () => new Date("2026-10-28T00:00:00.000Z") };

describe("concurrent find-then-insert", () => {
  it("getOrCreateWorkspace returns one job for parallel callers", async () => {
    const repos = new PostgresStoreFactory(sql).forOwner(ALICE);
    await repos.books.insert(book, parsed);
    const ids = counter();
    const jobs = await settled(
      Array.from({ length: 6 }, () => getOrCreateWorkspace({ ...repos, ids, clock }, "b1", "en")),
    );
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    expect(await repos.jobs.listByBook("b1")).toHaveLength(1);
  });

  it("importBook returns one book for parallel uploads of the same bytes", async () => {
    const repos = new PostgresStoreFactory(sql).forOwner(ALICE);
    const stored = new Map<string, Uint8Array>();
    const deps = {
      books: repos.books,
      blobs: {
        put: async (k: string, b: Uint8Array) => void stored.set(k, b),
        get: async (k: string) => stored.get(k) as Uint8Array,
        delete: async (k: string) => void stored.delete(k),
      },
      parser: { parse: async () => parsed },
      hasher: { sha256: async () => "same-sha" },
      ids: counter(),
      clock,
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const books = await settled(Array.from({ length: 6 }, () => importBook(deps, bytes)));
    expect(new Set(books.map((b) => b.id)).size).toBe(1);
    expect(await repos.books.list()).toHaveLength(1);
  });
});
