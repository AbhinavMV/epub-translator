import type { ProviderId } from "@et/contracts";
import type { TranslationProvider } from "@et/core";
import { AnthropicProvider } from "./anthropic.ts";
import { FakeProvider } from "./fake.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";

export interface ProviderEntry {
  provider: TranslationProvider | null;
  configured: boolean;
  defaultModel: string;
}

export type ProviderRegistry = Map<ProviderId, ProviderEntry>;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

function entry(
  key: string | undefined,
  defaultModel: string,
  create: (key: string) => TranslationProvider,
): ProviderEntry {
  return key
    ? { provider: create(key), configured: true, defaultModel }
    : { provider: null, configured: false, defaultModel };
}

export function buildProviderRegistry(env: Record<string, string | undefined>): ProviderRegistry {
  const anthropicModel = env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const openaiModel = env.OPENAI_MODEL || "";
  const geminiModel = env.GEMINI_MODEL || "";
  const registry = new Map<ProviderId, ProviderEntry>([
    [
      "anthropic",
      entry(env.ANTHROPIC_API_KEY, anthropicModel, (k) => new AnthropicProvider(k, anthropicModel)),
    ],
    ["openai", entry(env.OPENAI_API_KEY, openaiModel, (k) => new OpenAIProvider(k, openaiModel))],
    ["gemini", entry(env.GEMINI_API_KEY, geminiModel, (k) => new GeminiProvider(k, geminiModel))],
  ]);
  if (env.ENABLE_FAKE_PROVIDER === "1") {
    registry.set("fake", {
      provider: new FakeProvider(),
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
