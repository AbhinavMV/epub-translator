import type { PGlite } from "@electric-sql/pglite";
import type { Repositories } from "@et/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql } from "../src/index.ts";
import { batch, book, job, parsed } from "./fixtures.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;
let repos: Repositories;

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await resetData(db);
  repos = new PostgresStoreFactory(sql).forOwner(ALICE);
  await repos.books.insert(book, parsed);
  await repos.jobs.insert(job);
});

describe("PostgresBatchRepository", () => {
  it("round-trips a batch with its per-request segment ids", async () => {
    await repos.batches.insert(batch());
    expect(await repos.batches.openForChapter("j1", "ch-0")).toEqual(batch());
  });

  it("lists only submitted batches as open", async () => {
    await repos.batches.insert(batch());
    await repos.batches.insert(batch({ id: "pb2", chapterId: "ch-1", vendorBatchId: "v2" }));
    await repos.batches.setStatus("pb1", "ended");
    expect((await repos.batches.listOpen()).map((b) => b.id)).toEqual(["pb2"]);
    expect(await repos.batches.openForChapter("j1", "ch-0")).toBeNull();
    expect((await repos.batches.openForJob("j1")).map((b) => b.id)).toEqual(["pb2"]);
  });

  it("removes a job's batches when the job is deleted", async () => {
    await repos.batches.insert(batch());
    await db.query("delete from jobs where id = 'j1'");
    expect(await repos.batches.listOpen()).toEqual([]);
  });

  it("does not list another owner's open batches", async () => {
    await repos.batches.insert(batch());
    expect(await new PostgresStoreFactory(sql).forOwner(BOB).batches.listOpen()).toEqual([]);
  });
});
