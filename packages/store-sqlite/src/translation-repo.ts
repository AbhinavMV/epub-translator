import type { SegmentTranslation, TranslationRepository } from "@et/core";
import type { Database } from "./db.ts";

interface Row {
  text: string;
  status: SegmentTranslation["status"];
  note: string | null;
}

function toTranslation(row: Row): SegmentTranslation {
  return row.note
    ? { text: row.text, status: row.status, note: row.note }
    : { text: row.text, status: row.status };
}

export class SqliteTranslationRepository implements TranslationRepository {
  constructor(private readonly db: Database) {}

  get(jobId: string, segmentId: string): SegmentTranslation | null {
    const row = this.db
      .prepare("SELECT text, status, note FROM translations WHERE job_id = ? AND segment_id = ?")
      .get(jobId, segmentId) as Row | undefined;
    return row ? toTranslation(row) : null;
  }

  forJob(jobId: string): Map<string, SegmentTranslation> {
    const rows = this.db
      .prepare("SELECT segment_id, text, status, note FROM translations WHERE job_id = ?")
      .all(jobId) as (Row & { segment_id: string })[];
    return new Map(rows.map((r) => [r.segment_id, toTranslation(r)]));
  }

  put(jobId: string, segmentId: string, translation: SegmentTranslation): void {
    this.db
      .prepare(
        "INSERT INTO translations (job_id, segment_id, text, status, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(job_id, segment_id) DO UPDATE SET text = excluded.text, status = excluded.status, note = excluded.note",
      )
      .run(jobId, segmentId, translation.text, translation.status, translation.note ?? null);
  }

  deleteMany(jobId: string, segmentIds: readonly string[]): void {
    const stmt = this.db.prepare("DELETE FROM translations WHERE job_id = ? AND segment_id = ?");
    this.db.transaction((ids: readonly string[]) => {
      for (const id of ids) stmt.run(jobId, id);
    })(segmentIds);
  }
}
