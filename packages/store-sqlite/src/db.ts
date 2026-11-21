import BetterSqlite3 from "better-sqlite3";
import { migrate } from "./migrations.ts";

export type Database = BetterSqlite3.Database;

export function openDatabase(path: string): Database {
  const db = new BetterSqlite3(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function openDatabaseSnapshot(path: string): Database {
  const source = new BetterSqlite3(path, { fileMustExist: true });
  try {
    const bytes = source.serialize();
    // Header bytes 18-19 mark WAL mode, which an in-memory database cannot open.
    bytes[18] = 1;
    bytes[19] = 1;
    const db = new BetterSqlite3(bytes);
    db.pragma("foreign_keys = ON");
    migrate(db);
    return db;
  } finally {
    source.close();
  }
}
