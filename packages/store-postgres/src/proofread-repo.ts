import { type ChapterProofread, ChapterProofreadSchema } from "@et/contracts";
import type { ProofreadRepository } from "@et/core";
import { iso, json } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

interface ProofreadRow {
  job_id: string;
  chapter_id: string;
  model: string;
  created_at: Date | string;
  usage: unknown;
  suggestions: unknown;
}

const COLUMNS = "job_id, chapter_id, model, created_at, usage, suggestions";

function toProofread(row: ProofreadRow): ChapterProofread {
  return {
    jobId: row.job_id,
    chapterId: row.chapter_id,
    model: row.model,
    createdAt: iso(row.created_at),
    usage: ChapterProofreadSchema.shape.usage.parse(json(row.usage)),
    suggestions: ChapterProofreadSchema.shape.suggestions.parse(json(row.suggestions)),
  };
}

export class PostgresProofreadRepository implements ProofreadRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async get(jobId: string, chapterId: string): Promise<ChapterProofread | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<ProofreadRow>(
        `SELECT ${COLUMNS} FROM proofreads WHERE owner_id = $1 AND job_id = $2 AND chapter_id = $3`,
        [this.ownerId, jobId, chapterId],
      ),
    );
    return rows[0] ? toProofread(rows[0]) : null;
  }

  async listForJob(jobId: string): Promise<ChapterProofread[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<ProofreadRow>(
        `SELECT ${COLUMNS} FROM proofreads WHERE owner_id = $1 AND job_id = $2 ORDER BY chapter_id`,
        [this.ownerId, jobId],
      ),
    );
    return rows.map(toProofread);
  }

  async put(p: ChapterProofread): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO proofreads (owner_id, ${COLUMNS})
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::text::jsonb, $7::text::jsonb)
         ON CONFLICT (owner_id, job_id, chapter_id) DO UPDATE SET
           model = excluded.model, created_at = excluded.created_at,
           usage = excluded.usage, suggestions = excluded.suggestions`,
        [
          this.ownerId,
          p.jobId,
          p.chapterId,
          p.model,
          p.createdAt,
          JSON.stringify(p.usage),
          JSON.stringify(p.suggestions),
        ],
      ),
    );
  }

  async delete(jobId: string, chapterId: string): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("DELETE FROM proofreads WHERE owner_id = $1 AND job_id = $2 AND chapter_id = $3", [
        this.ownerId,
        jobId,
        chapterId,
      ]),
    );
  }
}
