import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { applyMigrations, concatMigrations, loadMigrations, MIGRATIONS_DIR } from "../src/index.ts";
import { createTestDatabase, pgliteSql } from "./harness.ts";

describe("migrations", () => {
  it("loads files in order and flags the storage migration as supabase-only", () => {
    const all = loadMigrations();
    expect(all.map((m) => m.name)).toEqual([
      "0001_users_and_invites.sql",
      "0002_library_tables.sql",
      "0003_library_rls.sql",
      "0004_storage_supabase.sql",
      "0005_rate_limits.sql",
      "0006_exports_text_supabase.sql",
      "0007_private_owner_role.sql",
      "0008_proofreads.sql",
    ]);
    expect(all.filter((m) => m.supabaseOnly).map((m) => m.name)).toEqual([
      "0004_storage_supabase.sql",
      "0006_exports_text_supabase.sql",
    ]);
  });

  it("applies once and is idempotent", async () => {
    const { db, sql } = await createTestDatabase();
    const migrations = loadMigrations().filter((m) => !m.supabaseOnly);
    expect(await applyMigrations(sql, migrations)).toEqual([]);
    const rows = await sql.query<{ name: string }>(
      "select name from schema_migrations order by name",
    );
    expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name));
    await db.close();
  });

  it("rolls a failing migration back and does not record it", async () => {
    const db = new PGlite();
    const sql = pgliteSql(db);
    await expect(
      applyMigrations(sql, [
        {
          name: "0001_bad.sql",
          sql: "create table t (a int); select nope();",
          supabaseOnly: false,
        },
      ]),
    ).rejects.toThrow();
    const [row] = await sql.query<{ n: number }>(
      "select count(*)::int as n from pg_tables where tablename = 't'",
    );
    expect(row?.n).toBe(0);
    await db.close();
  });

  it("keeps all.sql in sync with the migration files", () => {
    const bundled = readFileSync(join(MIGRATIONS_DIR, "all.sql"), "utf8");
    expect(bundled).toBe(concatMigrations(loadMigrations()));
  });

  it("scopes storage objects to the caller's folder", () => {
    const storage = readFileSync(join(MIGRATIONS_DIR, "0004_storage_supabase.sql"), "utf8");
    expect(storage).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
    expect(storage).toContain("on conflict (id) do nothing");
  });
});

describe("0007_private_owner_role", () => {
  it("drops the storage object policies when the storage schema exists", async () => {
    const db = new PGlite();
    const sql = pgliteSql(db);
    await db.exec(`
      create schema storage;
      create table storage.objects (id int, bucket_id text, name text);
      alter table storage.objects enable row level security;
      create role authenticated nologin;
      create policy et_objects_select_own on storage.objects for select to authenticated using (true);
      create policy et_objects_insert_own on storage.objects for insert to authenticated with check (true);
      create policy et_objects_delete_own on storage.objects for delete to authenticated using (true);
      create policy other_policy on storage.objects for select to authenticated using (true);
      create schema auth;
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create role anon nologin;
    `);
    const only = loadMigrations().filter((m) => m.name === "0007_private_owner_role.sql");
    await db.exec(
      "create table public.books (owner_id uuid); create table public.book_settings (owner_id uuid); create table public.jobs (owner_id uuid); create table public.translations (owner_id uuid); create table public.provider_batches (owner_id uuid); create table public.work_leases (owner_id uuid);",
    );
    await applyMigrations(sql, only);
    const rows = await sql.query<{ policyname: string }>(
      "select policyname from pg_policies where schemaname = 'storage'",
    );
    expect(rows.map((r) => r.policyname)).toEqual(["other_policy"]);
    await db.close();
  });

  it("is idempotent when applied twice by hand", async () => {
    const { db } = await createTestDatabase();
    const m = loadMigrations().find((x) => x.name === "0007_private_owner_role.sql");
    await db.exec(m?.sql ?? "");
    await db.exec(m?.sql ?? "");
    await db.close();
  });

  it("ships apply-0007.sql identical to the migration", () => {
    const apply = readFileSync(join(MIGRATIONS_DIR, "apply-0007.sql"), "utf8");
    const m = readFileSync(join(MIGRATIONS_DIR, "0007_private_owner_role.sql"), "utf8");
    expect(apply).toBe(m);
  });
});
