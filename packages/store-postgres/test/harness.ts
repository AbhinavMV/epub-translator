import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations, type Queryable, type Sql } from "../src/index.ts";

export const ALICE = "11111111-1111-4111-8111-111111111111";
export const BOB = "22222222-2222-4222-8222-222222222222";

const SUPABASE_STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
    )::uuid
  $$;
  do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

function wrap(db: Pick<PGlite, "query" | "exec">): Queryable {
  return {
    async query<T extends object>(text: string, params: readonly unknown[] = []) {
      const res = await db.query<T>(text, params as unknown[]);
      return res.rows;
    },
    async exec(text: string) {
      await db.exec(text);
    },
  };
}

export function pgliteSql(db: PGlite): Sql {
  return {
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    end: () => db.close(),
  };
}

export async function createTestDatabase(): Promise<{ db: PGlite; sql: Sql }> {
  const db = new PGlite();
  const sql = pgliteSql(db);
  await db.exec(SUPABASE_STUBS);
  await applyMigrations(
    sql,
    loadMigrations().filter((m) => !m.supabaseOnly),
  );
  await db.query("insert into auth.users (id) values ($1), ($2)", [ALICE, BOB]);
  return { db, sql };
}

export async function resetData(db: PGlite): Promise<void> {
  await db.exec("truncate public.books, public.app_users, public.invites cascade");
}
