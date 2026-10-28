import Anthropic from "@anthropic-ai/sdk";
import type { ProviderId } from "@et/contracts";
import type {
  BatchTranslationProvider,
  Proofreader,
  TermExtractor,
  TranslationProvider,
} from "@et/core";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { AnthropicProvider } from "./anthropic.ts";
import { AnthropicBatchProvider } from "./batch/anthropic.ts";
import { FakeBatchProvider } from "./batch/fake.ts";
import { GeminiBatchProvider } from "./batch/gemini.ts";
import { OpenAIBatchProvider } from "./batch/openai.ts";
import { FakeProvider } from "./fake.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProofreader } from "./proofread/anthropic.ts";
import { FakeProofreader } from "./proofread/fake.ts";
import { GeminiProofreader } from "./proofread/gemini.ts";
import { OpenAIProofreader } from "./proofread/openai.ts";
import { AnthropicTermExtractor } from "./terms/anthropic.ts";
import { FakeTermExtractor } from "./terms/fake.ts";
import { GeminiTermExtractor } from "./terms/gemini.ts";
import { OpenAITermExtractor } from "./terms/openai.ts";

export interface ProviderEntry {
  provider: TranslationProvider | null;
  batch?: BatchTranslationProvider | null;
  configured: boolean;
  defaultModel: string;
  terms?: TermExtractor | null;
  termsModel?: string;
  proofreader?: Proofreader | null;
}

export type ProviderRegistry = Map<ProviderId, ProviderEntry>;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const DEFAULT_ANTHROPIC_TERMS_MODEL = "claude-haiku-5-5";
export const DEFAULT_OPENAI_TERMS_MODEL = "gpt-5-nano";
export const DEFAULT_GEMINI_TERMS_MODEL = "gemini-2.5-flash-lite";

function entry(
  key: string | undefined,
  defaultModel: string,
  termsModel: string,
  create: (key: string) => {
    provider: TranslationProvider;
    terms: TermExtractor;
    batch: BatchTranslationProvider;
    proofreader: Proofreader;
  },
): ProviderEntry {
  if (!key) {
    return {
      provider: null,
      batch: null,
      configured: false,
      defaultModel,
      terms: null,
      termsModel,
      proofreader: null,
    };
  }
  const { provider, terms, batch, proofreader } = create(key);
  return { provider, batch, configured: true, defaultModel, terms, termsModel, proofreader };
}

export function buildProviderRegistry(env: Record<string, string | undefined>): ProviderRegistry {
  const anthropicModel = env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const openaiModel = env.OPENAI_MODEL || "";
  const geminiModel = env.GEMINI_MODEL || "";
  const registry = new Map<ProviderId, ProviderEntry>([
    [
      "anthropic",
      entry(
        env.ANTHROPIC_API_KEY,
        anthropicModel,
        env.ANTHROPIC_TERMS_MODEL || DEFAULT_ANTHROPIC_TERMS_MODEL,
        (k) => ({
          provider: new AnthropicProvider(k, anthropicModel),
          terms: new AnthropicTermExtractor(k, anthropicModel),
          batch: new AnthropicBatchProvider(anthropicModel, new Anthropic({ apiKey: k })),
          proofreader: new AnthropicProofreader(k, anthropicModel),
        }),
      ),
    ],
    [
      "openai",
      entry(
        env.OPENAI_API_KEY,
        openaiModel,
        env.OPENAI_TERMS_MODEL || DEFAULT_OPENAI_TERMS_MODEL,
        (k) => ({
          provider: new OpenAIProvider(k, openaiModel),
          terms: new OpenAITermExtractor(k, openaiModel),
          batch: new OpenAIBatchProvider(openaiModel, new OpenAI({ apiKey: k })),
          proofreader: new OpenAIProofreader(k, openaiModel),
        }),
      ),
    ],
    [
      "gemini",
      entry(
        env.GEMINI_API_KEY,
        geminiModel,
        env.GEMINI_TERMS_MODEL || DEFAULT_GEMINI_TERMS_MODEL,
        (k) => ({
          provider: new GeminiProvider(k, geminiModel),
          terms: new GeminiTermExtractor(k, geminiModel),
          batch: new GeminiBatchProvider(geminiModel, new GoogleGenAI({ apiKey: k })),
          proofreader: new GeminiProofreader(k, geminiModel),
        }),
      ),
    ],
  ]);
  if (env.ENABLE_FAKE_PROVIDER === "1") {
    const endsAfterFetches = Number(env.FAKE_BATCH_FETCHES ?? 2);
    registry.set("fake", {
      provider: new FakeProvider(),
      batch: new FakeBatchProvider({
        endsAfterFetches: Number.isFinite(endsAfterFetches) ? endsAfterFetches : 2,
      }),
      configured: true,
      defaultModel: "fake-echo",
      terms: new FakeTermExtractor(),
      termsModel: "fake-echo",
      proofreader: new FakeProofreader(),
    });
  }
  return registry;
}

export async function resolveDefaultModel(entry: ProviderEntry): Promise<string> {
  if (entry.defaultModel) return entry.defaultModel;
  const models = (await entry.provider?.listModels()) ?? [];
  return models[0] ?? "";
}
