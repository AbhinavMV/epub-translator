import type { ProviderId } from "@et/contracts";
import type { BatchRepository, ProviderBatch, ProviderBatchStatus } from "@et/core";
import type { Database } from "./db.ts";

interface BatchRow {
  id: string;
  job_id: string;
  chapter_id: string;
  provider: ProviderId;
  model: string;
  vendor_batch_id: string;
  status: ProviderBatchStatus;
  segment_ids_json: string;
  created_at: string;
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
    segmentIds: JSON.parse(row.segment_ids_json) as string[][],
    createdAt: row.created_at,
  };
}

export class SqliteBatchRepository implements BatchRepository {
  constructor(private readonly db: Database) {}

  async insert(batch: ProviderBatch): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO provider_batches (id, job_id, chapter_id, provider, model, vendor_batch_id, status, segment_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        batch.id,
        batch.jobId,
        batch.chapterId,
        batch.provider,
        batch.model,
        batch.vendorBatchId,
        batch.status,
        JSON.stringify(batch.segmentIds),
        batch.createdAt,
      );
  }

  async listOpen(): Promise<ProviderBatch[]> {
    const rows = this.db
      .prepare("SELECT * FROM provider_batches WHERE status = 'submitted' ORDER BY created_at")
      .all() as BatchRow[];
    return rows.map(toBatch);
  }

  async openForChapter(jobId: string, chapterId: string): Promise<ProviderBatch | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM provider_batches WHERE job_id = ? AND chapter_id = ? AND status = 'submitted'",
      )
      .get(jobId, chapterId) as BatchRow | undefined;
    return row ? toBatch(row) : null;
  }

  async openForJob(jobId: string): Promise<ProviderBatch[]> {
    const rows = this.db
      .prepare("SELECT * FROM provider_batches WHERE job_id = ? AND status = 'submitted'")
      .all(jobId) as BatchRow[];
    return rows.map(toBatch);
  }

  async setStatus(id: string, status: ProviderBatchStatus): Promise<void> {
    this.db.prepare("UPDATE provider_batches SET status = ? WHERE id = ?").run(status, id);
  }
}
