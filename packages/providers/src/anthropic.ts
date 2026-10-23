import Anthropic from "@anthropic-ai/sdk";
import type { ProviderId } from "@et/contracts";
import {
  buildPrompt,
  type SegmentBatchRequest,
  type SegmentBatchResult,
  type TranslationProvider,
} from "@et/core";
import { completionToResult, type RawCompletion } from "./completion.ts";
import { failureFromStatus, messageOf, retryAfterMs } from "./errors.ts";
import { SEGMENTS_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 16_000;

export function mapAnthropicError(
  err: unknown,
): SegmentBatchResult & { kind: "retryable" | "fatal" } {
  if (err instanceof Anthropic.APIConnectionError) {
    return { kind: "retryable", cause: err.message };
  }
  if (err instanceof Anthropic.APIError && typeof err.status === "number") {
    return failureFromStatus(err.status, err.message, retryAfterMs(err.headers));
  }
  return { kind: "fatal", cause: messageOf(err) };
}

export function anthropicParams(
  req: SegmentBatchRequest,
  defaultModel: string,
): Anthropic.MessageCreateParamsNonStreaming {
  const { system, user } = buildPrompt(req);
  return {
    model: req.model || defaultModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SEGMENTS_JSON_SCHEMA },
    },
  };
}

export function toCompletion(message: Anthropic.Message): RawCompletion {
  const usage = {
    inputTokens:
      message.usage.input_tokens +
      (message.usage.cache_creation_input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
  };
  if (message.stop_reason === "max_tokens") return { kind: "truncated", usage };
  if (message.stop_reason === "refusal") {
    return { kind: "refused", usage, category: message.stop_details?.category ?? null };
  }
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { kind: "text", text, usage };
}

export class AnthropicProvider implements TranslationProvider {
  readonly id: ProviderId = "anthropic";
  readonly label = "Anthropic Claude";

  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: Anthropic = new Anthropic({ apiKey, maxRetries: 0 }),
  ) {}

  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const model of this.client.models.list()) ids.push(model.id);
    return ids;
  }

  async translateSegments(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<SegmentBatchResult> {
    try {
      const message = await this.client.messages.create(anthropicParams(req, this.defaultModel), {
        signal,
      });
      return completionToResult(toCompletion(message));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapAnthropicError(err);
    }
  }
}
