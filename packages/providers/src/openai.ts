import type { ProviderId } from "@et/contracts";
import {
  buildPrompt,
  type SegmentBatchRequest,
  type SegmentBatchResult,
  type TranslationProvider,
} from "@et/core";
import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import { completionToResult, type RawCompletion } from "./completion.ts";
import { failureFromStatus, messageOf, retryAfterMs } from "./errors.ts";
import { SEGMENTS_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 16_000;
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/;
const NON_CHAT_MODEL =
  /embedding|audio|realtime|tts|transcribe|image|moderation|whisper|search|dall-e|codex|instruct/;

export function mapOpenAIError(err: unknown): SegmentBatchResult & { kind: "retryable" | "fatal" } {
  if (err instanceof OpenAI.APIConnectionError) {
    return { kind: "retryable", cause: err.message };
  }
  if (err instanceof OpenAI.APIError && typeof err.status === "number") {
    return failureFromStatus(err.status, err.message, retryAfterMs(err.headers));
  }
  return { kind: "fatal", cause: messageOf(err) };
}

function hasRefusal(response: Response): boolean {
  return response.output.some(
    (item) => item.type === "message" && item.content.some((c) => c.type === "refusal"),
  );
}

export function openaiParams(
  req: SegmentBatchRequest,
  defaultModel: string,
): ResponseCreateParamsNonStreaming {
  const { system, user } = buildPrompt(req);
  return {
    model: req.model || defaultModel,
    instructions: system,
    input: user,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: {
        type: "json_schema",
        name: "segments",
        schema: SEGMENTS_JSON_SCHEMA,
        strict: true,
      },
    },
  };
}

export function outputTextOf(response: Response): string {
  return response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .flatMap((c) => (c.type === "output_text" ? [c.text] : []))
    .join("");
}

export function toCompletion(response: Response): RawCompletion {
  const usage = {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
  if (response.incomplete_details?.reason === "max_output_tokens") {
    return { kind: "truncated", usage };
  }
  if (response.incomplete_details?.reason === "content_filter") {
    return { kind: "refused", usage, category: "content_filter" };
  }
  if (hasRefusal(response)) return { kind: "refused", usage, category: "refusal" };
  return { kind: "text", text: outputTextOf(response), usage };
}

export class OpenAIProvider implements TranslationProvider {
  readonly id: ProviderId = "openai";
  readonly label = "OpenAI";

  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: OpenAI = new OpenAI({ apiKey, maxRetries: 0 }),
  ) {}

  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const model of this.client.models.list()) {
      if (CHAT_MODEL.test(model.id) && !NON_CHAT_MODEL.test(model.id)) ids.push(model.id);
    }
    return ids.sort();
  }

  async translateSegments(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<SegmentBatchResult> {
    try {
      const response = await this.client.responses.create(openaiParams(req, this.defaultModel), {
        signal,
      });
      return completionToResult(toCompletion(response));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapOpenAIError(err);
    }
  }
}
