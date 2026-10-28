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
