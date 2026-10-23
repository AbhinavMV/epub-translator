import type { ProviderId } from "@et/contracts";

export type ProviderBatchStatus = "submitted" | "ended" | "failed" | "cancelled";

export interface ProviderBatch {
  id: string;
  jobId: string;
  chapterId: string;
  provider: ProviderId;
  model: string;
  vendorBatchId: string;
  status: ProviderBatchStatus;
  /** One entry per request; the request's customId is its index. */
  segmentIds: string[][];
  createdAt: string;
}
