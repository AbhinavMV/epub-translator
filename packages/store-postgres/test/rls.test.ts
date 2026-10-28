import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql, withOwner } from "../src/index.ts";
import { batch, book, job, parsed } from "./fixtures.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await resetData(db);
  const bob = new PostgresStoreFactory(sql).forOwner(BOB);
  await bob.books.insert(book, parsed);
  await bob.jobs.insert(job);
  await bob.translations.put("j1", "s1", { text: "secret", status: "done" });
  await bob.batches.insert(batch());
  await bob.settings.put("b1", { customPrompt: "p", glossary: [], provider: null, model: null });
  await sql.query(
    "insert into work_leases (owner_id, id, job_id, chapter_id, segment_ids, leased_until) values ($1, 'l1', 'j1', 'ch-0', '[]', now() + interval '1 hour')",
    [BOB],
  );
});

const OWNER_TABLES = [
  "books",
  "book_settings",
  "jobs",
  "translations",
  "provider_batches",
  "work_leases",
];

describe("row level security", () => {
  it("has RLS enabled on every table", async () => {
    const rows = await sql.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'schema_migrations'",
    );
    expect(rows.length).toBe(OWNER_TABLES.length + 2);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it.each(OWNER_TABLES)("hides another owner's rows in %s", async (table) => {
    const rows = await withOwner(sql, ALICE, (tx) => tx.query(`select * from ${table}`));
    expect(rows).toEqual([]);
    const own = await withOwner(sql, BOB, (tx) => tx.query(`select * from ${table}`));
    expect(own).toHaveLength(1);
  });

  it("cannot update or delete another owner's rows even with direct SQL", async () => {
    await withOwner(sql, ALICE, async (tx) => {
      expect(await tx.query("update books set title = 'pwned' returning id")).toEqual([]);
      expect(await tx.query("update translations set text = 'pwned' returning job_id")).toEqual([]);
      expect(await tx.query("delete from jobs returning id")).toEqual([]);
      expect(await tx.query("delete from books returning id")).toEqual([]);
    });
    const bob = new PostgresStoreFactory(sql).forOwner(BOB);
    expect((await bob.books.get("b1"))?.title).toBe("本");
    expect((await bob.translations.get("j1", "s1"))?.text).toBe("secret");
    expect(await bob.jobs.get("j1")).not.toBeNull();
  });

  it("cannot insert rows for another owner", async () => {
    await expect(
      withOwner(sql, ALICE, (tx) =>
        tx.query(
          "insert into books (owner_id, id, sha256, title, created_at, parsed_json) values ($1, 'x', 'x', 't', now(), '{}')",
          [BOB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot move a row to another owner", async () => {
    const alice = new PostgresStoreFactory(sql).forOwner(ALICE);
    await alice.books.insert({ ...book, id: "a1", sha256: "a" }, parsed);
    await expect(
      withOwner(sql, ALICE, (tx) =>
        tx.query("update books set owner_id = $1 where id = 'a1'", [BOB]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects a child row whose owner differs from its parent's", async () => {
    await expect(
      withOwner(sql, ALICE, (tx) =>
        tx.query(
          "insert into jobs (owner_id, id, book_id, target_lang, created_at) values ($1, 'jx', 'b1', 'fr', now())",
          [ALICE],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql.query(
        "insert into translations (owner_id, job_id, segment_id, text, status) values ($1, 'j1', 's9', 't', 'done')",
        [ALICE],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql.query(
        "insert into work_leases (owner_id, id, job_id, chapter_id, segment_ids, leased_until) values ($1, 'lx', 'j1', 'c', '[]', now())",
        [ALICE],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("sees nothing without a user, and nothing as anon", async () => {
    const none = await sql.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      return tx.query("select * from books");
    });
    expect(none).toEqual([]);
    await expect(
      sql.transaction(async (tx) => {
        await tx.exec("set local role anon");
        return tx.query("select * from books");
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not leak the role or claims after the transaction", async () => {
    await withOwner(sql, ALICE, (tx) => tx.query("select 1"));
    const [row] = await sql.query<{ role: string; claims: string }>(
      "select current_user as role, coalesce(current_setting('request.jwt.claims', true), '') as claims",
    );
    expect(row?.claims).toBe("");
    expect(row?.role).not.toBe("authenticated");
  });
});

describe("server-only tables", () => {
  beforeEach(async () => {
    await sql.query("insert into app_users (id, role) values ($1, 'admin'), ($2, 'user')", [
      ALICE,
      BOB,
    ]);
    await sql.query(
      "insert into invites (token_hash, expires_at) values ('h', now() + interval '1 day')",
    );
  });

  it("lets a user read only their own app_users row", async () => {
    const rows = await withOwner(sql, ALICE, (tx) =>
      tx.query<{ id: string }>("select id from app_users"),
    );
    expect(rows.map((r) => r.id)).toEqual([ALICE]);
  });

  it("denies authenticated writes to app_users", async () => {
    await expect(
      withOwner(sql, ALICE, (tx) => tx.query("update app_users set role = 'admin'")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withOwner(sql, ALICE, (tx) =>
        tx.query("insert into app_users (id, role) values (gen_random_uuid(), 'admin')"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("denies authenticated any access to invites", async () => {
    await expect(withOwner(sql, ALICE, (tx) => tx.query("select * from invites"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(withOwner(sql, ALICE, (tx) => tx.query("delete from invites"))).rejects.toThrow(
      /permission denied/,
    );
  });
});
