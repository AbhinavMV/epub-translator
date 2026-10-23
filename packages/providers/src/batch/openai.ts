import type { ProviderId } from "@et/contracts";
import type {
  BatchFetch,
  BatchRequest,
  BatchTranslationProvider,
  SegmentBatchResult,
} from "@et/core";
import type OpenAI from "openai";
import { toFile } from "openai";
import type { Response } from "openai/resources/responses/responses";
import { completionToResult } from "../completion.ts";
import { openaiParams, toCompletion } from "../openai.ts";

const IN_FLIGHT = new Set(["validating", "in_progress", "finalizing", "cancelling"]);

interface OutputLine {
  custom_id: string;
  response?: { status_code: number; body: Response } | null;
  error?: { code?: string; message?: string } | null;
}

function parseLines(text: string): OutputLine[] {
  return text
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as OutputLine);
}

function resultOf(line: OutputLine): SegmentBatchResult {
  if (line.error) {
    return { kind: "fatal", cause: `${line.error.code ?? "error"}: ${line.error.message ?? ""}` };
  }
  if (line.response?.status_code !== 200) {
    return { kind: "fatal", cause: `HTTP ${line.response?.status_code ?? "unknown"}` };
  }
  return completionToResult(toCompletion(line.response.body));
}

export class OpenAIBatchProvider implements BatchTranslationProvider {
  readonly id: ProviderId = "openai";

  constructor(
    private readonly defaultModel: string,
    private readonly client: OpenAI,
  ) {}

  async submit(requests: BatchRequest[]): Promise<string> {
    const jsonl = requests
      .map((r) =>
        JSON.stringify({
          custom_id: r.customId,
          method: "POST",
          url: "/v1/responses",
          body: openaiParams(r.request, this.defaultModel),
        }),
      )
      .join("\n");
    const file = await this.client.files.create({
      file: await toFile(new TextEncoder().encode(`${jsonl}\n`), "requests.jsonl", {
        type: "application/jsonl",
      }),
      purpose: "batch",
    });
    const batch = await this.client.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });
    return batch.id;
  }

  async fetch(batchId: string): Promise<BatchFetch> {
    const batch = await this.client.batches.retrieve(batchId);
    if (IN_FLIGHT.has(batch.status)) return { status: "in_progress" };
    if (!batch.output_file_id && !batch.error_file_id) {
      const cause = batch.errors?.data?.[0]?.message ?? `batch ${batch.status}`;
      return { status: "failed", cause };
    }
    const results = new Map<string, SegmentBatchResult>();
    for (const fileId of [batch.output_file_id, batch.error_file_id]) {
      if (!fileId) continue;
      const text = await (await this.client.files.content(fileId)).text();
      for (const line of parseLines(text)) results.set(line.custom_id, resultOf(line));
    }
    return { status: "ended", results };
  }

  async cancel(batchId: string): Promise<void> {
    await this.client.batches.cancel(batchId);
  }
}
