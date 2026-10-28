import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "./sql.ts";

export interface Migration {
  name: string;
  sql: string;
  supabaseOnly: boolean;
}

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(dir, name), "utf8"),
      supabaseOnly: name.includes("_supabase"),
    }));
}

export function concatMigrations(migrations: readonly Migration[]): string {
  return migrations.map((m) => `-- ${m.name}\n${m.sql.trimEnd()}\n`).join("\n");
}

export async function applyMigrations(
  sql: Sql,
  migrations: readonly Migration[],
): Promise<string[]> {
  await sql.exec(
    "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  await sql.exec(
    `alter table public.schema_migrations enable row level security;
    do $$ declare r text; begin
      foreach r in array array['anon', 'authenticated'] loop
        if exists (select from pg_roles where rolname = r) then
          execute format('revoke all on public.schema_migrations from %I', r);
        end if;
      end loop;
    end $$;`,
  );
  const done = new Set(
    (await sql.query<{ name: string }>("select name from public.schema_migrations")).map(
      (r) => r.name,
    ),
  );
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    await sql.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into public.schema_migrations (name) values ($1)", [m.name]);
    });
    applied.push(m.name);
  }
  return applied;
}
