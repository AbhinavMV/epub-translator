import type Anthropic from "@anthropic-ai/sdk";
import { getTargetLanguage } from "@et/contracts";
import type { TermExtractionRequest } from "@et/core";
import type { GoogleGenAI } from "@google/genai";
import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { buildProviderRegistry } from "../src/registry.ts";
import { AnthropicTermExtractor } from "../src/terms/anthropic.ts";
import { termsResult } from "../src/terms/completion.ts";
import { FakeTermExtractor } from "../src/terms/fake.ts";
import { GeminiTermExtractor } from "../src/terms/gemini.ts";
import { OpenAITermExtractor } from "../src/terms/openai.ts";
import { parseTermsJson } from "../src/terms/schema.ts";

const signal = new AbortController().signal;
const usage = { inputTokens: 3, outputTokens: 4 };
const payload = JSON.stringify({
  terms: [
    { source: "シャルロット", target: "Charlotte", note: "female lead" },
    { source: "魔王", target: "Demon King", note: "" },
  ],
});
const expectedTerms = [
  { source: "シャルロット", target: "Charlotte", note: "female lead" },
  { source: "魔王", target: "Demon King" },
];

const request: TermExtractionRequest = {
  model: "m",
  sourceLang: "ja",
  target: getTargetLanguage("en"),
  bookTitle: "本",
  sample: "シャルロットは魔王に会った。",
  existing: [],
};

describe("parseTermsJson", () => {
  it("drops empty notes and unusable entries", () => {
    const raw = JSON.stringify({
      terms: [
        { source: "a", target: "A", note: "" },
        { source: "", target: "B", note: "x" },
      ],
    });
    expect(parseTermsJson(raw)).toEqual([{ source: "a", target: "A" }]);
  });

  it("accepts fenced JSON and returns nothing for garbage", () => {
    expect(parseTermsJson(`\`\`\`json\n${payload}\n\`\`\``)).toEqual(expectedTerms);
    expect(parseTermsJson("not json")).toEqual([]);
  });
});

describe("termsResult", () => {
  it("reports truncated and refused completions as fatal", () => {
    expect(termsResult({ kind: "truncated", usage })).toMatchObject({ kind: "fatal" });
    expect(termsResult({ kind: "refused", usage })).toMatchObject({ kind: "fatal" });
  });
});

describe("AnthropicTermExtractor", () => {
  function client(reply: unknown) {
    const calls: Record<string, unknown>[] = [];
    const fake = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    } as unknown as Anthropic;
    return { fake, calls };
  }

  it("returns parsed terms and usage using a JSON schema output", async () => {
    const { fake, calls } = client({
      stop_reason: "end_turn",
      content: [{ type: "text", text: payload }],
      usage: { input_tokens: 3, output_tokens: 4 },
    });
    const result = await new AnthropicTermExtractor("k", "default", fake).extractTerms(
      request,
      signal,
    );
    expect(result).toEqual({ kind: "ok", terms: expectedTerms, usage });
    expect(calls[0]).toMatchObject({
      model: "m",
      output_config: { format: { type: "json_schema" } },
    });
  });

  it("maps API failures to a retryable or fatal result", async () => {
    const { fake } = client(new Error("boom"));
    const result = await new AnthropicTermExtractor("k", "default", fake).extractTerms(
      request,
      signal,
    );
    expect(result).toEqual({ kind: "fatal", cause: "boom" });
  });
});

describe("OpenAITermExtractor", () => {
  it("returns parsed terms and usage", async () => {
    const calls: Record<string, unknown>[] = [];
    const fake = {
      responses: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return {
            output: [{ type: "message", content: [{ type: "output_text", text: payload }] }],
            output_text: payload,
            usage: { input_tokens: 3, output_tokens: 4 },
          };
        },
      },
    } as unknown as OpenAI;
    const result = await new OpenAITermExtractor("k", "default", fake).extractTerms(
      request,
      signal,
    );
    expect(result).toEqual({ kind: "ok", terms: expectedTerms, usage });
    expect(calls[0]).toMatchObject({
      model: "m",
      text: { format: { type: "json_schema", strict: true } },
    });
  });
});

describe("GeminiTermExtractor", () => {
  it("returns parsed terms and usage", async () => {
    const fake = {
      models: {
        generateContent: async () => ({
          text: payload,
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: payload }] } }],
          usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
        }),
      },
    } as unknown as GoogleGenAI;
    const result = await new GeminiTermExtractor("k", "default", fake).extractTerms(
      request,
      signal,
    );
    expect(result).toEqual({ kind: "ok", terms: expectedTerms, usage });
  });
});

describe("FakeTermExtractor", () => {
  it("suggests deterministic terms drawn from the sample", async () => {
    const result = await new FakeTermExtractor().extractTerms(
      { ...request, sample: "Alice met Bob. Alice left." },
      signal,
    );
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.terms.map((t) => t.source)).toEqual(["Alice", "Bob"]);
    expect(result.terms[0]?.target).toBe("[en] Alice");
  });

  it("skips capitalised words that are already in the glossary", async () => {
    const result = await new FakeTermExtractor().extractTerms(
      { ...request, sample: "Alice met Bob.", existing: [{ source: "Alice", target: "A" }] },
      signal,
    );
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.terms.map((t) => t.source)).toEqual(["Bob"]);
  });
});

describe("registry term extractors", () => {
  it("exposes an extractor and cheap default model for configured providers", () => {
    const registry = buildProviderRegistry({
      ANTHROPIC_API_KEY: "k",
      ENABLE_FAKE_PROVIDER: "1",
    });
    expect(registry.get("anthropic")?.terms).toBeInstanceOf(AnthropicTermExtractor);
    expect(registry.get("anthropic")?.termsModel).toBe("claude-haiku-5-5");
    expect(registry.get("openai")?.terms).toBeNull();
    expect(registry.get("fake")?.terms).toBeInstanceOf(FakeTermExtractor);
  });
});
