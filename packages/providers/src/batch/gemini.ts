import type { ProviderId } from "@et/contracts";
import type {
  BatchFetch,
  BatchRequest,
  BatchTranslationProvider,
  SegmentBatchResult,
} from "@et/core";
import type { GoogleGenAI, InlinedResponse } from "@google/genai";
import { completionToResult } from "../completion.ts";
import { geminiRequest, toCompletion } from "../gemini.ts";

const IN_FLIGHT = new Set([
  "JOB_STATE_UNSPECIFIED",
  "JOB_STATE_QUEUED",
  "JOB_STATE_PENDING",
  "JOB_STATE_RUNNING",
  "JOB_STATE_CANCELLING",
  "JOB_STATE_PAUSED",
]);

function resultOf(entry: InlinedResponse): SegmentBatchResult {
  if (entry.error || !entry.response) {
    return { kind: "fatal", cause: entry.error?.message ?? "no response" };
  }
  return completionToResult(toCompletion(entry.response));
}

export class GeminiBatchProvider implements BatchTranslationProvider {
  readonly id: ProviderId = "gemini";

  constructor(
    private readonly defaultModel: string,
    private readonly client: GoogleGenAI,
  ) {}

  async submit(requests: BatchRequest[]): Promise<string> {
    const built = requests.map((r) => ({
      customId: r.customId,
      ...geminiRequest(r.request, this.defaultModel),
    }));
    const job = await this.client.batches.create({
      model: built[0]?.model ?? this.defaultModel,
      src: built.map((b) => ({
        contents: b.contents,
        config: b.config,
        metadata: { key: b.customId },
      })),
    });
    if (!job.name) throw new Error("Gemini did not return a batch name");
    return job.name;
  }

  async fetch(batchId: string): Promise<BatchFetch> {
    const job = await this.client.batches.get({ name: batchId });
    const state = job.state ?? "JOB_STATE_UNSPECIFIED";
    if (IN_FLIGHT.has(state)) return { status: "in_progress" };
    if (state !== "JOB_STATE_SUCCEEDED") {
      return { status: "failed", cause: job.error?.message ?? state };
    }
    const results = new Map<string, SegmentBatchResult>();
    (job.dest?.inlinedResponses ?? []).forEach((entry, index) => {
      results.set(entry.metadata?.key ?? String(index), resultOf(entry));
    });
    return { status: "ended", results };
  }

  async cancel(batchId: string): Promise<void> {
    await this.client.batches.cancel({ name: batchId });
  }
}
