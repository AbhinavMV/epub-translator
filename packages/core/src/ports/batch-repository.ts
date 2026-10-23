import type { ProviderBatch, ProviderBatchStatus } from "../domain/batch.ts";

export interface BatchRepository {
  insert(batch: ProviderBatch): void;
  listOpen(): ProviderBatch[];
  openForChapter(jobId: string, chapterId: string): ProviderBatch | null;
  openForJob(jobId: string): ProviderBatch[];
  setStatus(id: string, status: ProviderBatchStatus): void;
}
