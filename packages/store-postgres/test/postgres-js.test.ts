import type { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresSql, PostgresStoreFactory, type Sql } from "../src/index.ts";
import { book, job, parsed } from "./fixtures.ts";
import { ALICE, BOB, createTestDatabase } from "./harness.ts";

const PORT = 54329;
let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;

beforeAll(async () => {
  ({ db } = await createTestDatabase());
  server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();
  sql = createPostgresSql(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { ssl: false });
});
afterAll(async () => {
  await sql.end();
  await server.stop();
  await db.close();
});

describe("postgres.js adapter", () => {
  it("round-trips repositories over the wire protocol with prepare disabled", async () => {
    const alice = new PostgresStoreFactory(sql).forOwner(ALICE);
    await alice.books.insert(book, parsed);
    await alice.jobs.insert(job);
    await alice.jobs.addUsage("j1", { inputTokens: 4, outputTokens: 2 });
    await alice.translations.put("j1", "s1", { text: "a", status: "done", note: "n" });
    await alice.translations.deleteMany("j1", ["nope"]);
    expect(await alice.books.get("b1")).toEqual(book);
    expect(await alice.jobs.get("j1")).toMatchObject({
      usage: { inputTokens: 4, outputTokens: 2 },
    });
    expect((await alice.translations.forJob("j1")).get("s1")).toEqual({
      text: "a",
      status: "done",
      note: "n",
    });
    const fresh = new PostgresStoreFactory(sql).forOwner(ALICE);
    expect(await fresh.books.getParsed("b1")).toEqual(parsed);
  });

  it("enforces RLS and rolls back failed transactions", async () => {
    const bob = new PostgresStoreFactory(sql).forOwner(BOB);
    expect(await bob.books.list()).toEqual([]);
    await expect(bob.jobs.insert(job)).rejects.toThrow();
    expect(await bob.jobs.get("j1")).toBeNull();
  });

  it("runs multi-statement scripts through exec", async () => {
    await sql.exec("create temp table t1 (a int); create temp table t2 (a int)");
  });
});
