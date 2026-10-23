import type Anthropic from "@anthropic-ai/sdk";
import type { ProviderId } from "@et/contracts";
import type {
  BatchFetch,
  BatchRequest,
  BatchTranslationProvider,
  SegmentBatchResult,
} from "@et/core";
import { anthropicParams, toCompletion } from "../anthropic.ts";
import { completionToResult } from "../completion.ts";

function resultOf(entry: Anthropic.Messages.MessageBatchIndividualResponse): SegmentBatchResult {
  const result = entry.result;
  switch (result.type) {
    case "succeeded":
      return completionToResult(toCompletion(result.message));
    case "errored": {
      const detail = result.error.error;
      const cause = `${detail.type}: ${detail.message}`;
      return detail.type === "invalid_request_error"
        ? { kind: "fatal", cause }
        : { kind: "retryable", cause };
    }
    case "canceled":
      return { kind: "retryable", cause: "request was canceled before it ran" };
    case "expired":
      return { kind: "retryable", cause: "request expired before it ran" };
  }
}

export class AnthropicBatchProvider implements BatchTranslationProvider {
  readonly id: ProviderId = "anthropic";

  constructor(
    private readonly defaultModel: string,
    private readonly client: Anthropic,
  ) {}

  async submit(requests: BatchRequest[]): Promise<string> {
    const batch = await this.client.messages.batches.create({
      requests: requests.map((r) => ({
        custom_id: r.customId,
        params: anthropicParams(r.request, this.defaultModel),
      })),
    });
    return batch.id;
  }

  async fetch(batchId: string): Promise<BatchFetch> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") return { status: "in_progress" };
    const results = new Map<string, SegmentBatchResult>();
    for await (const entry of await this.client.messages.batches.results(batchId)) {
      results.set(entry.custom_id, resultOf(entry));
    }
    return { status: "ended", results };
  }

  async cancel(batchId: string): Promise<void> {
    await this.client.messages.batches.cancel(batchId);
  }
}
