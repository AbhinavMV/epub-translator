import { existsSync } from "node:fs";
import { LOCAL_OWNER_ID } from "@et/contracts";
import {
  backfillProjects,
  describeBackfillPlan,
  type IdGenerator,
  type StoreFactory,
} from "@et/core";
import { PostgresStoreFactory, type Sql } from "@et/store-postgres";
import { openDatabase, openDatabaseSnapshot, SqliteStoreFactory } from "@et/store-sqlite";

export interface BackfillTarget {
  factory: StoreFactory;
  ownerIds(): Promise<string[]>;
  close(): void;
}

export function sqliteBackfill(path: string, options: { apply: boolean }): BackfillTarget {
  if (!existsSync(path)) throw new Error(`No SQLite database at ${path}`);
  const db = options.apply ? openDatabase(path) : openDatabaseSnapshot(path);
  return {
    factory: new SqliteStoreFactory(db),
    ownerIds: async () => [LOCAL_OWNER_ID],
    close: () => db.close(),
  };
}

export function postgresBackfill(sql: Sql, ownerId?: string): BackfillTarget {
  const factory = new PostgresStoreFactory(sql);
  return {
    factory,
    ownerIds: async () => (ownerId ? [ownerId] : factory.bookOwners()),
    close: () => {},
  };
}

export async function runProjectBackfill(
  target: BackfillTarget,
  options: { apply: boolean; ids: IdGenerator; log: (line: string) => void },
): Promise<void> {
  try {
    for (const ownerId of await target.ownerIds()) {
      options.log(`Owner ${ownerId}`);
      const plan = await backfillProjects(
        { ...target.factory.forOwner(ownerId), ids: options.ids },
        { apply: options.apply },
      );
      for (const line of describeBackfillPlan(plan)) options.log(line);
    }
    options.log(
      options.apply ? "Applied." : "Dry run: nothing was written. Re-run with --apply to write.",
    );
  } finally {
    target.close();
  }
}
