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

  async get(jobId: string, segmentId: string): Promise<SegmentTranslation | null> {
    const row = this.db
      .prepare("SELECT text, status, note FROM translations WHERE job_id = ? AND segment_id = ?")
      .get(jobId, segmentId) as Row | undefined;
    return row ? toTranslation(row) : null;
  }

  async forJob(jobId: string): Promise<Map<string, SegmentTranslation>> {
    const rows = this.db
      .prepare("SELECT segment_id, text, status, note FROM translations WHERE job_id = ?")
      .all(jobId) as (Row & { segment_id: string })[];
    return new Map(rows.map((r) => [r.segment_id, toTranslation(r)]));
  }

  async statusesForJob(jobId: string): Promise<Map<string, SegmentTranslation["status"]>> {
    const rows = this.db
      .prepare("SELECT segment_id, status FROM translations WHERE job_id = ?")
      .all(jobId) as { segment_id: string; status: SegmentTranslation["status"] }[];
    return new Map(rows.map((r) => [r.segment_id, r.status]));
  }

  async forSegments(
    jobId: string,
    segmentIds: readonly string[],
  ): Promise<Map<string, SegmentTranslation>> {
    const stmt = this.db.prepare(
      "SELECT segment_id, text, status, note FROM translations WHERE job_id = ? AND segment_id IN (SELECT value FROM json_each(?))",
    );
    if (segmentIds.length === 0) return new Map();
    const rows = stmt.all(jobId, JSON.stringify(segmentIds)) as (Row & { segment_id: string })[];
    return new Map(rows.map((r) => [r.segment_id, toTranslation(r)]));
  }

  async put(jobId: string, segmentId: string, translation: SegmentTranslation): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO translations (job_id, segment_id, text, status, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(job_id, segment_id) DO UPDATE SET text = excluded.text, status = excluded.status, note = excluded.note",
      )
      .run(jobId, segmentId, translation.text, translation.status, translation.note ?? null);
  }

  async deleteMany(jobId: string, segmentIds: readonly string[]): Promise<void> {
    const stmt = this.db.prepare("DELETE FROM translations WHERE job_id = ? AND segment_id = ?");
    this.db.transaction((ids: readonly string[]) => {
      for (const id of ids) stmt.run(jobId, id);
    })(segmentIds);
  }
}
