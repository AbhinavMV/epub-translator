import { type BookSettings, BookSettingsSchema } from "@et/contracts";
import type { BookSettingsRepository } from "@et/core";
import { json } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

const DEFAULTS: BookSettings = { customPrompt: "", glossary: [], provider: null, model: null };

export class PostgresBookSettingsRepository implements BookSettingsRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async get(bookId: string): Promise<BookSettings> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<{ json: unknown }>(
        "SELECT json FROM book_settings WHERE owner_id = $1 AND book_id = $2",
        [this.ownerId, bookId],
      ),
    );
    return rows[0] ? BookSettingsSchema.parse(json(rows[0].json)) : structuredClone(DEFAULTS);
  }

  async put(bookId: string, settings: BookSettings): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO book_settings (owner_id, book_id, json) VALUES ($1, $2, $3::text::jsonb)
         ON CONFLICT (owner_id, book_id) DO UPDATE SET json = excluded.json`,
        [this.ownerId, bookId, JSON.stringify(settings)],
      ),
    );
  }
}
