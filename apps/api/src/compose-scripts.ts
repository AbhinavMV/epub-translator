import { existsSync } from "node:fs";
import { LOCAL_OWNER_ID } from "@et/contracts";
import { createPostgresSql, PostgresStoreFactory, type Sql } from "@et/store-postgres";
import { openDatabase, openDatabaseSnapshot, SqliteStoreFactory } from "@et/store-sqlite";
import type { ScriptTarget } from "./owner-script.ts";

export function sqliteTarget(path: string, options: { apply: boolean }): ScriptTarget {
  if (!existsSync(path)) throw new Error(`No SQLite database at ${path}`);
  const db = options.apply ? openDatabase(path) : openDatabaseSnapshot(path);
  return {
    factory: new SqliteStoreFactory(db),
    ownerIds: async () => [LOCAL_OWNER_ID],
    close: async () => {
      db.close();
    },
  };
}

export function postgresTarget(sql: Sql, ownerId?: string, end = async () => {}): ScriptTarget {
  const factory = new PostgresStoreFactory(sql);
  return {
    factory,
    ownerIds: async () => (ownerId ? [ownerId] : factory.bookOwners()),
    close: end,
  };
}

export function postgresUrlTarget(url: string, ownerId?: string): ScriptTarget {
  const sql = createPostgresSql(url);
  return postgresTarget(sql, ownerId, () => sql.end());
}
