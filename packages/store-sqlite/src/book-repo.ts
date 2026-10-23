import type { BookRepository, ParsedBook, StoredBook } from "@et/core";
import type { Database } from "./db.ts";

interface BookRow {
  id: string;
  sha256: string;
  title: string;
  author: string | null;
  source_lang: string | null;
  cover_href: string | null;
  created_at: string;
}

const COLUMNS = "id, sha256, title, author, source_lang, cover_href, created_at";

function toBook(row: BookRow): StoredBook {
  return {
    id: row.id,
    sha256: row.sha256,
    title: row.title,
    author: row.author,
    sourceLang: row.source_lang,
    coverHref: row.cover_href,
    createdAt: row.created_at,
  };
}

export class SqliteBookRepository implements BookRepository {
  private readonly parsedCache = new Map<string, ParsedBook>();

  constructor(private readonly db: Database) {}

  insert(book: StoredBook, parsed: ParsedBook): void {
    this.db
      .prepare(`INSERT INTO books (${COLUMNS}, parsed_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        book.id,
        book.sha256,
        book.title,
        book.author,
        book.sourceLang,
        book.coverHref,
        book.createdAt,
        JSON.stringify(parsed),
      );
  }

  get(id: string): StoredBook | null {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM books WHERE id = ?`).get(id) as
      | BookRow
      | undefined;
    return row ? toBook(row) : null;
  }

  findBySha256(sha256: string): StoredBook | null {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM books WHERE sha256 = ?`).get(sha256) as
      | BookRow
      | undefined;
    return row ? toBook(row) : null;
  }

  getParsed(id: string): ParsedBook | null {
    const cached = this.parsedCache.get(id);
    if (cached) return cached;
    const row = this.db.prepare("SELECT parsed_json FROM books WHERE id = ?").get(id) as
      | { parsed_json: string }
      | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.parsed_json) as ParsedBook;
    this.parsedCache.set(id, parsed);
    return parsed;
  }

  updateParsed(id: string, parsed: ParsedBook): void {
    this.db
      .prepare("UPDATE books SET parsed_json = ? WHERE id = ?")
      .run(JSON.stringify(parsed), id);
    this.parsedCache.set(id, parsed);
  }

  list(): StoredBook[] {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM books ORDER BY created_at DESC`)
      .all() as BookRow[];
    return rows.map(toBook);
  }

  delete(id: string): void {
    this.parsedCache.delete(id);
    this.db.prepare("DELETE FROM books WHERE id = ?").run(id);
  }
}
