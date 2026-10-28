import type Anthropic from "@anthropic-ai/sdk";
import { getTargetLanguage } from "@et/contracts";
import type { ProofreadRequest } from "@et/core";
import type { GoogleGenAI } from "@google/genai";
import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserProvider } from "../src/browser.ts";
import { AnthropicProofreader } from "../src/proofread/anthropic.ts";
import { proofreadResult } from "../src/proofread/completion.ts";
import { FakeProofreader } from "../src/proofread/fake.ts";
import { GeminiProofreader } from "../src/proofread/gemini.ts";
import { OpenAIProofreader } from "../src/proofread/openai.ts";
import { parseProofreadJson } from "../src/proofread/schema.ts";
import { buildProviderRegistry } from "../src/registry.ts";

const signal = new AbortController().signal;
const usage = { inputTokens: 3, outputTokens: 4 };
const payload = JSON.stringify({
  edits: [{ id: "s1", kind: "accuracy", text: "He was sulking.", reason: "拗ねる is sulk" }],
  notes: [{ source: "周", target: "Amane", note: "" }],
});
const expected = {
  kind: "ok",
  edits: [{ id: "s1", kind: "accuracy", text: "He was sulking.", reason: "拗ねる is sulk" }],
  notes: [{ source: "周", target: "Amane" }],
  usage,
};

const request: ProofreadRequest = {
  model: "m",
  sourceLang: "ja",
  target: getTargetLanguage("en"),
  bookTitle: "本",
  glossary: [],
  notes: [],
  segments: [{ id: "s1", source: "彼は拗ねた。", translation: "He was angry." }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseProofreadJson", () => {
  it("files an unknown kind under other and drops empty notes", () => {
    const raw = JSON.stringify({
      edits: [{ id: "s1", kind: "style", text: "t", reason: "r" }],
      notes: [{ source: "", target: "x", note: "" }],
    });
    expect(parseProofreadJson(raw)).toEqual({
      edits: [{ id: "s1", kind: "other", text: "t", reason: "r" }],
      notes: [],
    });
  });

  it("accepts fenced JSON and rejects garbage", () => {
    expect(parseProofreadJson(`\`\`\`json\n${payload}\n\`\`\``)?.edits).toHaveLength(1);
    expect(parseProofreadJson("not json")).toBeNull();
  });
});

describe("proofreadResult", () => {
  it("retries malformed JSON and fails a cut-off or declined answer", () => {
    expect(proofreadResult({ kind: "text", text: "{", usage })).toMatchObject({
      kind: "retryable",
    });
    expect(proofreadResult({ kind: "truncated", usage })).toMatchObject({ kind: "fatal" });
    expect(proofreadResult({ kind: "refused", usage })).toMatchObject({ kind: "fatal" });
  });
});

describe("AnthropicProofreader", () => {
  it("returns edits and notes using a JSON schema output", async () => {
    const calls: Record<string, unknown>[] = [];
    const fake = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return {
            stop_reason: "end_turn",
            content: [{ type: "text", text: payload }],
            usage: { input_tokens: 3, output_tokens: 4 },
          };
        },
      },
    } as unknown as Anthropic;
    expect(await new AnthropicProofreader("k", "d", fake).proofread(request, signal)).toEqual(
      expected,
    );
    expect(calls[0]).toMatchObject({
      model: "m",
      output_config: { format: { type: "json_schema" } },
    });
  });
});

describe("OpenAIProofreader", () => {
  it("returns edits and notes", async () => {
    const fake = {
      responses: {
        create: async () => ({
          output: [{ type: "message", content: [{ type: "output_text", text: payload }] }],
          output_text: payload,
          usage: { input_tokens: 3, output_tokens: 4 },
        }),
      },
    } as unknown as OpenAI;
    expect(await new OpenAIProofreader("k", "d", fake).proofread(request, signal)).toEqual(
      expected,
    );
  });
});

describe("GeminiProofreader", () => {
  it("returns edits and notes", async () => {
    const fake = {
      models: {
        generateContent: async () => ({
          text: payload,
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: payload }] } }],
          usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
        }),
      },
    } as unknown as GoogleGenAI;
    expect(await new GeminiProofreader("k", "d", fake).proofread(request, signal)).toEqual(
      expected,
    );
  });
});

describe("FakeProofreader", () => {
  it("tidies doubled spaces and leaves clean text alone", async () => {
    const result = await new FakeProofreader().proofread(
      {
        ...request,
        segments: [
          { id: "a", source: "一", translation: "One  two." },
          { id: "b", source: "二", translation: "Fine." },
        ],
      },
      signal,
    );
    expect(result).toMatchObject({
      kind: "ok",
      edits: [{ id: "a", kind: "fluency", text: "One two." }],
    });
  });
});

describe("proofreaders in the registry and browser bundle", () => {
  it("exposes a proofreader for configured providers only", () => {
    const registry = buildProviderRegistry({ ANTHROPIC_API_KEY: "k", ENABLE_FAKE_PROVIDER: "1" });
    expect(registry.get("anthropic")?.proofreader).toBeInstanceOf(AnthropicProofreader);
    expect(registry.get("openai")?.proofreader).toBeNull();
    expect(registry.get("fake")?.proofreader).toBeInstanceOf(FakeProofreader);
  });

  it("redacts the key from browser proofreading failures", async () => {
    const KEY = "sk-fake-1234567890abcdefWXYZ";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ type: "error", error: { type: "api_error", message: KEY } }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    const { proofreader } = createBrowserProvider("anthropic", KEY, "m");
    const result = await proofreader.proofread(request, signal);
    expect(result.kind).not.toBe("ok");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});
