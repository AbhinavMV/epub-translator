import type BetterSqlite3 from "better-sqlite3";

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE books (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    source_lang TEXT,
    cover_href TEXT,
    created_at TEXT NOT NULL,
    parsed_json TEXT NOT NULL
  );
  CREATE TABLE book_settings (
    book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    json TEXT NOT NULL
  );
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    target_lang TEXT NOT NULL,
    source_lang TEXT,
    error TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (book_id, target_lang)
  );
  CREATE TABLE translations (
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (job_id, segment_id)
  );
  `,
  `
  CREATE TABLE provider_batches (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    vendor_batch_id TEXT NOT NULL,
    status TEXT NOT NULL,
    segment_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX provider_batches_open ON provider_batches (status, job_id, chapter_id);
  `,
  `
  ALTER TABLE translations ADD COLUMN note TEXT;
  `,
  `
  CREATE TABLE proofreads (
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    chapter_id TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (job_id, chapter_id)
  );
  `,
];

export function migrate(db: BetterSqlite3.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v] as string);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
