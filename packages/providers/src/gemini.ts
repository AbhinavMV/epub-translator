import type { ProviderId } from "@et/contracts";
import {
  buildPrompt,
  type SegmentBatchRequest,
  type SegmentBatchResult,
  type TranslationProvider,
} from "@et/core";
import {
  ApiError,
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
} from "@google/genai";
import { completionToResult, type RawCompletion } from "./completion.ts";
import { failureFromStatus, messageOf } from "./errors.ts";
import { SEGMENTS_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 16_000;
const REFUSAL_FINISH_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "RECITATION",
]);

export function mapGeminiError(err: unknown): SegmentBatchResult & { kind: "retryable" | "fatal" } {
  if (err instanceof ApiError) return failureFromStatus(err.status, err.message);
  if (err instanceof TypeError) return { kind: "retryable", cause: messageOf(err) };
  return { kind: "fatal", cause: messageOf(err) };
}

export function geminiRequest(
  req: SegmentBatchRequest,
  defaultModel: string,
): { model: string; contents: string; config: GenerateContentConfig } {
  const { system, user } = buildPrompt(req);
  return {
    model: req.model || defaultModel,
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: SEGMENTS_JSON_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };
}

export function textOf(response: GenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts.flatMap((p) => (p.text && !p.thought ? [p.text] : [])).join("");
}

export function toCompletion(response: GenerateContentResponse): RawCompletion {
  const usage = {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens:
      (response.usageMetadata?.candidatesTokenCount ?? 0) +
      (response.usageMetadata?.thoughtsTokenCount ?? 0),
  };
  const finish = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason) return { kind: "refused", usage };
  if (finish === "MAX_TOKENS") return { kind: "truncated", usage };
  if (finish && REFUSAL_FINISH_REASONS.has(finish)) return { kind: "refused", usage };
  return { kind: "text", text: textOf(response), usage };
}

export class GeminiProvider implements TranslationProvider {
  readonly id: ProviderId = "gemini";
  readonly label = "Google Gemini";

  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: GoogleGenAI = new GoogleGenAI({ apiKey }),
  ) {}

  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const model of await this.client.models.list()) {
      const id = model.name?.replace(/^models\//, "");
      if (id?.startsWith("gemini") && model.supportedActions?.includes("generateContent")) {
        ids.push(id);
      }
    }
    return ids;
  }

  async translateSegments(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<SegmentBatchResult> {
    const built = geminiRequest(req, this.defaultModel);
    try {
      const response = await this.client.models.generateContent({
        ...built,
        config: { ...built.config, abortSignal: signal },
      });
      return completionToResult(toCompletion(response));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapGeminiError(err);
    }
  }
}
