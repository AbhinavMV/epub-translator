import type { ProviderId } from "@et/contracts";
import type {
  BatchFetch,
  BatchRequest,
  BatchTranslationProvider,
  SegmentBatchResult,
} from "@et/core";
import { FakeProvider } from "../fake.ts";

interface Held {
  requests: BatchRequest[];
  fetches: number;
  cancelled: boolean;
}

export class FakeBatchProvider implements BatchTranslationProvider {
  readonly id: ProviderId = "fake";
  private readonly batches = new Map<string, Held>();
  private readonly echo = new FakeProvider();
  private counter = 0;

  constructor(private readonly options: { endsAfterFetches: number } = { endsAfterFetches: 1 }) {}

  async submit(requests: BatchRequest[]): Promise<string> {
    const id = `fake-batch-${++this.counter}`;
    this.batches.set(id, { requests, fetches: 0, cancelled: false });
    return id;
  }

  async fetch(batchId: string): Promise<BatchFetch> {
    const held = this.batches.get(batchId);
    if (!held) return { status: "failed", cause: `unknown batch ${batchId}` };
    if (held.cancelled) return { status: "failed", cause: "cancelled" };
    held.fetches++;
    if (held.fetches < this.options.endsAfterFetches) return { status: "in_progress" };
    const results = new Map<string, SegmentBatchResult>();
    for (const r of held.requests) {
      results.set(
        r.customId,
        await this.echo.translateSegments(r.request, new AbortController().signal),
      );
    }
    return { status: "ended", results };
  }

  async cancel(batchId: string): Promise<void> {
    const held = this.batches.get(batchId);
    if (held) held.cancelled = true;
  }
}
