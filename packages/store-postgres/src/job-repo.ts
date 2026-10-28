import type { Usage } from "@et/contracts";
import type { Job, JobRepository } from "@et/core";
import { iso } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

interface JobRow {
  id: string;
  book_id: string;
  target_lang: string;
  source_lang: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: Date | string;
}

const COLUMNS =
  "id, book_id, target_lang, source_lang, error, input_tokens, output_tokens, created_at";

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    bookId: row.book_id,
    targetLang: row.target_lang,
    sourceLang: row.source_lang,
    error: row.error,
    usage: { inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) },
    createdAt: iso(row.created_at),
  };
}

export class PostgresJobRepository implements JobRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async insert(job: Job): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO jobs (owner_id, ${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7::int, $8::int, $9::timestamptz)`,
        [
          this.ownerId,
          job.id,
          job.bookId,
          job.targetLang,
          job.sourceLang,
          job.error,
          job.usage.inputTokens,
          job.usage.outputTokens,
          job.createdAt,
        ],
      ),
    );
  }

  async insertIfAbsent(job: Job): Promise<Job> {
    return withOwner(this.sql, this.ownerId, async (tx) => {
      await tx.query(
        `INSERT INTO jobs (owner_id, ${COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7::int, $8::int, $9::timestamptz)
         ON CONFLICT (owner_id, book_id, target_lang) DO NOTHING`,
        [
          this.ownerId,
          job.id,
          job.bookId,
          job.targetLang,
          job.sourceLang,
          job.error,
          job.usage.inputTokens,
          job.usage.outputTokens,
          job.createdAt,
        ],
      );
      const rows = await tx.query<JobRow>(
        `SELECT ${COLUMNS} FROM jobs WHERE owner_id = $1 AND book_id = $2 AND target_lang = $3`,
        [this.ownerId, job.bookId, job.targetLang],
      );
      return toJob(rows[0] as JobRow);
    });
  }

  async get(id: string): Promise<Job | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<JobRow>(`SELECT ${COLUMNS} FROM jobs WHERE owner_id = $1 AND id = $2`, [
        this.ownerId,
        id,
      ]),
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async findByBookAndLang(bookId: string, targetLang: string): Promise<Job | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<JobRow>(
        `SELECT ${COLUMNS} FROM jobs WHERE owner_id = $1 AND book_id = $2 AND target_lang = $3`,
        [this.ownerId, bookId, targetLang],
      ),
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  async listByBook(bookId: string): Promise<Job[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<JobRow>(
        `SELECT ${COLUMNS} FROM jobs WHERE owner_id = $1 AND book_id = $2 ORDER BY created_at`,
        [this.ownerId, bookId],
      ),
    );
    return rows.map(toJob);
  }

  async update(id: string, patch: Partial<Pick<Job, "error" | "usage">>): Promise<void> {
    await withOwner(this.sql, this.ownerId, async (tx) => {
      if ("error" in patch) {
        await tx.query("UPDATE jobs SET error = $3 WHERE owner_id = $1 AND id = $2", [
          this.ownerId,
          id,
          patch.error ?? null,
        ]);
      }
      if (patch.usage) {
        await tx.query(
          "UPDATE jobs SET input_tokens = $3::int, output_tokens = $4::int WHERE owner_id = $1 AND id = $2",
          [this.ownerId, id, patch.usage.inputTokens, patch.usage.outputTokens],
        );
      }
    });
  }

  async addUsage(id: string, usage: Usage): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `UPDATE jobs SET input_tokens = input_tokens + $3::int, output_tokens = output_tokens + $4::int
         WHERE owner_id = $1 AND id = $2`,
        [this.ownerId, id, usage.inputTokens, usage.outputTokens],
      ),
    );
  }
}
