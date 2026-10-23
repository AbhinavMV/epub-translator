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
