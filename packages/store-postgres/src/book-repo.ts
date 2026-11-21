import { assertPlaced, type BookRepository, type ParsedBook, type StoredBook } from "@et/core";
import { iso, json } from "./convert.ts";
import type { ParsedBookCache } from "./parsed-cache.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

interface BookRow {
  id: string;
  sha256: string;
  title: string;
  author: string | null;
  source_lang: string | null;
  cover_href: string | null;
  created_at: Date | string;
  project_id: string | null;
  volume_number: number | string | null;
}

const COLUMNS =
  "id, sha256, title, author, source_lang, cover_href, created_at, project_id, volume_number";

function toBook(row: BookRow): StoredBook {
  return {
    id: row.id,
    sha256: row.sha256,
    title: row.title,
    author: row.author,
    sourceLang: row.source_lang,
    coverHref: row.cover_href,
    createdAt: iso(row.created_at),
    projectId: row.project_id,
    volumeNumber: row.volume_number === null ? null : Number(row.volume_number),
  };
}

export class PostgresBookRepository implements BookRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
    private readonly cache: ParsedBookCache,
  ) {}

  async insert(book: StoredBook, parsed: ParsedBook): Promise<void> {
    assertPlaced(book);
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO books (owner_id, ${COLUMNS}, parsed_json, segment_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11::text::jsonb, $12)`,
        [
          this.ownerId,
          book.id,
          book.sha256,
          book.title,
          book.author,
          book.sourceLang,
          book.coverHref,
          book.createdAt,
          book.projectId,
          book.volumeNumber,
          JSON.stringify(parsed),
          parsed.segments.length,
        ],
      ),
    );
  }

  async insertIfAbsent(book: StoredBook, parsed: ParsedBook): Promise<StoredBook> {
    assertPlaced(book);
    return withOwner(this.sql, this.ownerId, async (tx) => {
      await tx.query(
        `INSERT INTO books (owner_id, ${COLUMNS}, parsed_json, segment_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11::text::jsonb, $12)
         ON CONFLICT (owner_id, sha256) DO NOTHING`,
        [
          this.ownerId,
          book.id,
          book.sha256,
          book.title,
          book.author,
          book.sourceLang,
          book.coverHref,
          book.createdAt,
          book.projectId,
          book.volumeNumber,
          JSON.stringify(parsed),
          parsed.segments.length,
        ],
      );
      const rows = await tx.query<BookRow>(
        `SELECT ${COLUMNS} FROM books WHERE owner_id = $1 AND sha256 = $2`,
        [this.ownerId, book.sha256],
      );
      return toBook(rows[0] as BookRow);
    });
  }

  async get(id: string): Promise<StoredBook | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BookRow>(`SELECT ${COLUMNS} FROM books WHERE owner_id = $1 AND id = $2`, [
        this.ownerId,
        id,
      ]),
    );
    return rows[0] ? toBook(rows[0]) : null;
  }

  async findBySha256(sha256: string): Promise<StoredBook | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BookRow>(`SELECT ${COLUMNS} FROM books WHERE owner_id = $1 AND sha256 = $2`, [
        this.ownerId,
        sha256,
      ]),
    );
    return rows[0] ? toBook(rows[0]) : null;
  }

  async getParsed(id: string): Promise<ParsedBook | null> {
    const cached = this.cache.get(this.ownerId, id);
    if (cached) return cached;
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<{ parsed_json: unknown }>(
        "SELECT parsed_json FROM books WHERE owner_id = $1 AND id = $2",
        [this.ownerId, id],
      ),
    );
    if (!rows[0]) return null;
    const parsed = json<ParsedBook>(rows[0].parsed_json);
    this.cache.set(this.ownerId, id, parsed);
    return parsed;
  }

  async updateParsed(id: string, parsed: ParsedBook): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        "UPDATE books SET parsed_json = $3::text::jsonb, segment_count = $4 WHERE owner_id = $1 AND id = $2",
        [this.ownerId, id, JSON.stringify(parsed), parsed.segments.length],
      ),
    );
    this.cache.set(this.ownerId, id, parsed);
  }

  async segmentCounts(ids: readonly string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<{ id: string; segment_count: number }>(
        `SELECT id, segment_count FROM books
         WHERE owner_id = $1 AND id = ANY(ARRAY(SELECT jsonb_array_elements_text($2::text::jsonb)))`,
        [this.ownerId, JSON.stringify(ids)],
      ),
    );
    return new Map(rows.map((r) => [r.id, r.segment_count]));
  }

  async list(): Promise<StoredBook[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BookRow>(
        `SELECT ${COLUMNS} FROM books WHERE owner_id = $1 ORDER BY created_at DESC`,
        [this.ownerId],
      ),
    );
    return rows.map(toBook);
  }

  async listByProject(projectId: string): Promise<StoredBook[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BookRow>(
        `SELECT ${COLUMNS} FROM books WHERE owner_id = $1 AND project_id = $2
         ORDER BY volume_number NULLS LAST, created_at, id`,
        [this.ownerId, projectId],
      ),
    );
    return rows.map(toBook);
  }

  async place(id: string, projectId: string, volumeNumber: number): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        "UPDATE books SET project_id = $3, volume_number = $4 WHERE owner_id = $1 AND id = $2",
        [this.ownerId, id, projectId, volumeNumber],
      ),
    );
  }

  async delete(id: string): Promise<void> {
    this.cache.delete(this.ownerId, id);
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("DELETE FROM books WHERE owner_id = $1 AND id = $2", [this.ownerId, id]),
    );
  }

  async setBlobKey(id: string, blobKey: string | null): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("UPDATE books SET blob_key = $3 WHERE owner_id = $1 AND id = $2", [
        this.ownerId,
        id,
        blobKey,
      ]),
    );
  }

  async getBlobKey(id: string): Promise<string | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<{ blob_key: string | null }>(
        "SELECT blob_key FROM books WHERE owner_id = $1 AND id = $2",
        [this.ownerId, id],
      ),
    );
    return rows[0]?.blob_key ?? null;
  }
}
