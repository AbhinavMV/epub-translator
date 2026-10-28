import type { ProviderId } from "@et/contracts";
import type { BatchRepository, ProviderBatch, ProviderBatchStatus } from "@et/core";
import { iso, json } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

interface BatchRow {
  id: string;
  job_id: string;
  chapter_id: string;
  provider: ProviderId;
  model: string;
  vendor_batch_id: string;
  status: ProviderBatchStatus;
  segment_ids: unknown;
  created_at: Date | string;
}

function toBatch(row: BatchRow): ProviderBatch {
  return {
    id: row.id,
    jobId: row.job_id,
    chapterId: row.chapter_id,
    provider: row.provider,
    model: row.model,
    vendorBatchId: row.vendor_batch_id,
    status: row.status,
    segmentIds: json<string[][]>(row.segment_ids),
    createdAt: iso(row.created_at),
  };
}

export class PostgresBatchRepository implements BatchRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async insert(batch: ProviderBatch): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO provider_batches
           (owner_id, id, job_id, chapter_id, provider, model, vendor_batch_id, status, segment_ids, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10::timestamptz)`,
        [
          this.ownerId,
          batch.id,
          batch.jobId,
          batch.chapterId,
          batch.provider,
          batch.model,
          batch.vendorBatchId,
          batch.status,
          JSON.stringify(batch.segmentIds),
          batch.createdAt,
        ],
      ),
    );
  }

  async listOpen(): Promise<ProviderBatch[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BatchRow>(
        "SELECT * FROM provider_batches WHERE owner_id = $1 AND status = 'submitted' ORDER BY created_at",
        [this.ownerId],
      ),
    );
    return rows.map(toBatch);
  }

  async openForChapter(jobId: string, chapterId: string): Promise<ProviderBatch | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BatchRow>(
        `SELECT * FROM provider_batches
         WHERE owner_id = $1 AND job_id = $2 AND chapter_id = $3 AND status = 'submitted'`,
        [this.ownerId, jobId, chapterId],
      ),
    );
    return rows[0] ? toBatch(rows[0]) : null;
  }

  async openForJob(jobId: string): Promise<ProviderBatch[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<BatchRow>(
        "SELECT * FROM provider_batches WHERE owner_id = $1 AND job_id = $2 AND status = 'submitted'",
        [this.ownerId, jobId],
      ),
    );
    return rows.map(toBatch);
  }

  async setStatus(id: string, status: ProviderBatchStatus): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("UPDATE provider_batches SET status = $3 WHERE owner_id = $1 AND id = $2", [
        this.ownerId,
        id,
        status,
      ]),
    );
  }
}
