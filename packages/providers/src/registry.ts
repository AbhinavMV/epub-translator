import Anthropic from "@anthropic-ai/sdk";
import type { ProviderId } from "@et/contracts";
import type { BatchTranslationProvider, TranslationProvider } from "@et/core";
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

export interface ProviderEntry {
  provider: TranslationProvider | null;
  batch?: BatchTranslationProvider | null;
  configured: boolean;
  defaultModel: string;
}

export type ProviderRegistry = Map<ProviderId, ProviderEntry>;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

function entry(
  key: string | undefined,
  defaultModel: string,
  create: (key: string) => { provider: TranslationProvider; batch: BatchTranslationProvider },
): ProviderEntry {
  if (!key) return { provider: null, batch: null, configured: false, defaultModel };
  const { provider, batch } = create(key);
  return { provider, batch, configured: true, defaultModel };
}

export function buildProviderRegistry(env: Record<string, string | undefined>): ProviderRegistry {
  const anthropicModel = env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const openaiModel = env.OPENAI_MODEL || "";
  const geminiModel = env.GEMINI_MODEL || "";
  const registry = new Map<ProviderId, ProviderEntry>([
    [
      "anthropic",
      entry(env.ANTHROPIC_API_KEY, anthropicModel, (k) => ({
        provider: new AnthropicProvider(k, anthropicModel),
        batch: new AnthropicBatchProvider(anthropicModel, new Anthropic({ apiKey: k })),
      })),
    ],
    [
      "openai",
      entry(env.OPENAI_API_KEY, openaiModel, (k) => ({
        provider: new OpenAIProvider(k, openaiModel),
        batch: new OpenAIBatchProvider(openaiModel, new OpenAI({ apiKey: k })),
      })),
    ],
    [
      "gemini",
      entry(env.GEMINI_API_KEY, geminiModel, (k) => ({
        provider: new GeminiProvider(k, geminiModel),
        batch: new GeminiBatchProvider(geminiModel, new GoogleGenAI({ apiKey: k })),
      })),
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
    });
  }
  return registry;
}

export async function resolveDefaultModel(entry: ProviderEntry): Promise<string> {
  if (entry.defaultModel) return entry.defaultModel;
  const models = (await entry.provider?.listModels()) ?? [];
  return models[0] ?? "";
}
