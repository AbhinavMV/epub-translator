import type { ProviderBatch, ProviderBatchStatus } from "../domain/batch.ts";

export interface BatchRepository {
  insert(batch: ProviderBatch): Promise<void>;
  listOpen(): Promise<ProviderBatch[]>;
  openForChapter(jobId: string, chapterId: string): Promise<ProviderBatch | null>;
  openForJob(jobId: string): Promise<ProviderBatch[]>;
  setStatus(id: string, status: ProviderBatchStatus): Promise<void>;
}
