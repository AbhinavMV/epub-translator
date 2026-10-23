import type { ProviderId } from "@et/contracts";
import type { TermExtractor, TranslationProvider } from "@et/core";
import { AnthropicProvider } from "./anthropic.ts";
import { FakeProvider } from "./fake.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicTermExtractor } from "./terms/anthropic.ts";
import { FakeTermExtractor } from "./terms/fake.ts";
import { GeminiTermExtractor } from "./terms/gemini.ts";
import { OpenAITermExtractor } from "./terms/openai.ts";

export interface ProviderEntry {
  provider: TranslationProvider | null;
  configured: boolean;
  defaultModel: string;
  terms?: TermExtractor | null;
  termsModel?: string;
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
  create: (key: string) => { provider: TranslationProvider; terms: TermExtractor },
): ProviderEntry {
  if (!key) return { provider: null, configured: false, defaultModel, terms: null, termsModel };
  const { provider, terms } = create(key);
  return { provider, configured: true, defaultModel, terms, termsModel };
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
        }),
      ),
    ],
  ]);
  if (env.ENABLE_FAKE_PROVIDER === "1") {
    registry.set("fake", {
      provider: new FakeProvider(),
      configured: true,
      defaultModel: "fake-echo",
      terms: new FakeTermExtractor(),
      termsModel: "fake-echo",
    });
  }
  return registry;
}

export async function resolveDefaultModel(entry: ProviderEntry): Promise<string> {
  if (entry.defaultModel) return entry.defaultModel;
  const models = (await entry.provider?.listModels()) ?? [];
  return models[0] ?? "";
}
