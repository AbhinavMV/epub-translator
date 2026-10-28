import { type BookSettings, BookSettingsSchema } from "@et/contracts";
import type { BookSettingsRepository } from "@et/core";
import type { Database } from "./db.ts";

const DEFAULTS: BookSettings = { customPrompt: "", glossary: [], provider: null, model: null };

export class SqliteBookSettingsRepository implements BookSettingsRepository {
  constructor(private readonly db: Database) {}

  async get(bookId: string): Promise<BookSettings> {
    const row = this.db.prepare("SELECT json FROM book_settings WHERE book_id = ?").get(bookId) as
      | { json: string }
      | undefined;
    return row ? BookSettingsSchema.parse(JSON.parse(row.json)) : structuredClone(DEFAULTS);
  }

  async put(bookId: string, settings: BookSettings): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO book_settings (book_id, json) VALUES (?, ?) ON CONFLICT(book_id) DO UPDATE SET json = excluded.json",
      )
      .run(bookId, JSON.stringify(settings));
  }
}
