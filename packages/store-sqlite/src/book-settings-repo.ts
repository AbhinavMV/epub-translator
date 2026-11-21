import {
  type BookSettings,
  BookSettingsSchema,
  type LegacyBookTerms,
  LegacyBookTermsSchema,
} from "@et/contracts";
import type { BookSettingsRepository } from "@et/core";
import type { Database } from "./db.ts";

const DEFAULTS: BookSettings = { provider: null, model: null };

export class SqliteBookSettingsRepository implements BookSettingsRepository {
  constructor(private readonly db: Database) {}

  private row(bookId: string): unknown {
    const row = this.db.prepare("SELECT json FROM book_settings WHERE book_id = ?").get(bookId) as
      | { json: string }
      | undefined;
    return row ? JSON.parse(row.json) : undefined;
  }

  async get(bookId: string): Promise<BookSettings> {
    const json = this.row(bookId);
    return json ? BookSettingsSchema.parse(json) : structuredClone(DEFAULTS);
  }

  async put(bookId: string, settings: BookSettings): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO book_settings (book_id, json) VALUES (?, ?) ON CONFLICT(book_id) DO UPDATE SET json = json_patch(book_settings.json, excluded.json)",
      )
      .run(bookId, JSON.stringify(BookSettingsSchema.parse(settings)));
  }

  async getLegacyTerms(bookId: string): Promise<LegacyBookTerms | null> {
    const json = this.row(bookId);
    return json ? LegacyBookTermsSchema.parse(json) : null;
  }
}
