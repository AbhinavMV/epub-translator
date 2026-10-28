import type { Usage } from "@et/contracts";
import type { Job, JobRepository } from "@et/core";
import type { Database } from "./db.ts";

interface JobRow {
  id: string;
  book_id: string;
  target_lang: string;
  source_lang: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    bookId: row.book_id,
    targetLang: row.target_lang,
    sourceLang: row.source_lang,
    error: row.error,
    usage: { inputTokens: row.input_tokens, outputTokens: row.output_tokens },
    createdAt: row.created_at,
  };
}

export class SqliteJobRepository implements JobRepository {
  constructor(private readonly db: Database) {}

  async insert(job: Job): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO jobs (id, book_id, target_lang, source_lang, error, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        job.id,
        job.bookId,
        job.targetLang,
        job.sourceLang,
        job.error,
        job.usage.inputTokens,
        job.usage.outputTokens,
        job.createdAt,
      );
  }

  async insertIfAbsent(job: Job): Promise<Job> {
    const existing = await this.findByBookAndLang(job.bookId, job.targetLang);
    if (existing) return existing;
    await this.insert(job);
    return job;
  }

  async get(id: string): Promise<Job | null> {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  async findByBookAndLang(bookId: string, targetLang: string): Promise<Job | null> {
    const row = this.db
      .prepare("SELECT * FROM jobs WHERE book_id = ? AND target_lang = ?")
      .get(bookId, targetLang) as JobRow | undefined;
    return row ? toJob(row) : null;
  }

  async listByBook(bookId: string): Promise<Job[]> {
    const rows = this.db
      .prepare("SELECT * FROM jobs WHERE book_id = ? ORDER BY created_at")
      .all(bookId) as JobRow[];
    return rows.map(toJob);
  }

  async update(id: string, patch: Partial<Pick<Job, "error" | "usage">>): Promise<void> {
    if ("error" in patch) {
      this.db.prepare("UPDATE jobs SET error = ? WHERE id = ?").run(patch.error ?? null, id);
    }
    if (patch.usage) {
      this.db
        .prepare("UPDATE jobs SET input_tokens = ?, output_tokens = ? WHERE id = ?")
        .run(patch.usage.inputTokens, patch.usage.outputTokens, id);
    }
  }

  async addUsage(id: string, usage: Usage): Promise<void> {
    this.db
      .prepare(
        "UPDATE jobs SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE id = ?",
      )
      .run(usage.inputTokens, usage.outputTokens, id);
  }
}
