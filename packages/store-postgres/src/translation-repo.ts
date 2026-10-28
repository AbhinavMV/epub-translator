import type { SegmentTranslation, TranslationRepository } from "@et/core";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

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

export class PostgresTranslationRepository implements TranslationRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async get(jobId: string, segmentId: string): Promise<SegmentTranslation | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<Row>(
        "SELECT text, status, note FROM translations WHERE owner_id = $1 AND job_id = $2 AND segment_id = $3",
        [this.ownerId, jobId, segmentId],
      ),
    );
    return rows[0] ? toTranslation(rows[0]) : null;
  }

  async forJob(jobId: string): Promise<Map<string, SegmentTranslation>> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<Row & { segment_id: string }>(
        "SELECT segment_id, text, status, note FROM translations WHERE owner_id = $1 AND job_id = $2",
        [this.ownerId, jobId],
      ),
    );
    return new Map(rows.map((r) => [r.segment_id, toTranslation(r)]));
  }

  async forSegments(
    jobId: string,
    segmentIds: readonly string[],
  ): Promise<Map<string, SegmentTranslation>> {
    if (segmentIds.length === 0) return new Map();
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<Row & { segment_id: string }>(
        `SELECT segment_id, text, status, note FROM translations
         WHERE owner_id = $1 AND job_id = $2
         AND segment_id = ANY(ARRAY(SELECT jsonb_array_elements_text($3::text::jsonb)))`,
        [this.ownerId, jobId, JSON.stringify(segmentIds)],
      ),
    );
    return new Map(rows.map((r) => [r.segment_id, toTranslation(r)]));
  }

  async put(jobId: string, segmentId: string, translation: SegmentTranslation): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO translations (owner_id, job_id, segment_id, text, status, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (owner_id, job_id, segment_id)
         DO UPDATE SET text = excluded.text, status = excluded.status, note = excluded.note`,
        [
          this.ownerId,
          jobId,
          segmentId,
          translation.text,
          translation.status,
          translation.note ?? null,
        ],
      ),
    );
  }

  async deleteMany(jobId: string, segmentIds: readonly string[]): Promise<void> {
    if (segmentIds.length === 0) return;
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `DELETE FROM translations WHERE owner_id = $1 AND job_id = $2
         AND segment_id IN (SELECT jsonb_array_elements_text($3::text::jsonb))`,
        [this.ownerId, jobId, JSON.stringify(segmentIds)],
      ),
    );
  }
}
