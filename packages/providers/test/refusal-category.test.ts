import type Anthropic from "@anthropic-ai/sdk";
import type { GenerateContentResponse } from "@google/genai";
import type { Response } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import { toCompletion as anthropicCompletion } from "../src/anthropic.ts";
import { completionToResult } from "../src/completion.ts";
import { toCompletion as geminiCompletion } from "../src/gemini.ts";
import { toCompletion as openaiCompletion } from "../src/openai.ts";

const usage = { inputTokens: 1, outputTokens: 0 };

describe("refusal categories", () => {
  it("carries Anthropic's stop_details category", () => {
    const message = {
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "general_harms", explanation: null },
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    } as unknown as Anthropic.Message;
    expect(completionToResult(anthropicCompletion(message))).toEqual({
      kind: "refused",
      usage,
      category: "general_harms",
    });
  });

  it("reports OpenAI content filtering as the category", () => {
    const response = {
      incomplete_details: { reason: "content_filter" },
      output: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    } as unknown as Response;
    expect(completionToResult(openaiCompletion(response))).toMatchObject({
      kind: "refused",
      category: "content_filter",
    });
  });

  it("reports Gemini's finish reason as the category", () => {
    const response = {
      candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0 },
    } as unknown as GenerateContentResponse;
    expect(completionToResult(geminiCompletion(response))).toMatchObject({
      kind: "refused",
      category: "SAFETY",
    });
  });
});
