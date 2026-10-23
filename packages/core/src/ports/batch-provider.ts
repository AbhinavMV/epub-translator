import type { ProviderId } from "@et/contracts";
import type { SegmentBatchRequest, SegmentBatchResult } from "./translation-provider.ts";

export interface BatchRequest {
  customId: string;
  request: SegmentBatchRequest;
}

export type BatchFetch =
  | { status: "in_progress" }
  | { status: "ended"; results: Map<string, SegmentBatchResult> }
  | { status: "failed"; cause: string };

export interface BatchTranslationProvider {
  readonly id: ProviderId;
  submit(requests: BatchRequest[]): Promise<string>;
  fetch(batchId: string): Promise<BatchFetch>;
  cancel(batchId: string): Promise<void>;
}
