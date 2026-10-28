import { type ChapterProofread, ChapterProofreadSchema } from "@et/contracts";
import type { ProofreadRepository } from "@et/core";
import type { Database } from "./db.ts";

export class SqliteProofreadRepository implements ProofreadRepository {
  constructor(private readonly db: Database) {}

  async get(jobId: string, chapterId: string): Promise<ChapterProofread | null> {
    const row = this.db
      .prepare("SELECT json FROM proofreads WHERE job_id = ? AND chapter_id = ?")
      .get(jobId, chapterId) as { json: string } | undefined;
    return row ? ChapterProofreadSchema.parse(JSON.parse(row.json)) : null;
  }

  async listForJob(jobId: string): Promise<ChapterProofread[]> {
    const rows = this.db
      .prepare("SELECT json FROM proofreads WHERE job_id = ? ORDER BY chapter_id")
      .all(jobId) as { json: string }[];
    return rows.map((r) => ChapterProofreadSchema.parse(JSON.parse(r.json)));
  }

  async put(proofread: ChapterProofread): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO proofreads (job_id, chapter_id, json) VALUES (?, ?, ?)
         ON CONFLICT(job_id, chapter_id) DO UPDATE SET json = excluded.json`,
      )
      .run(proofread.jobId, proofread.chapterId, JSON.stringify(proofread));
  }

  async delete(jobId: string, chapterId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM proofreads WHERE job_id = ? AND chapter_id = ?")
      .run(jobId, chapterId);
  }
}
