import type { ProviderInfo } from "@et/contracts";
import type { Api, EventSourceLike } from "@/api/client";
import { KEYED_PROVIDERS, type KeyedProvider } from "@/keys/envelope";
import type { Vault } from "@/keys/vault";
import type { ClientRuntime } from "./runtime";

interface Fallback {
  label: string;
  defaultModel: string;
  models: string[];
  termsModel: string;
}

export const HOSTED_FALLBACKS: Record<KeyedProvider, Fallback> = {
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5-5",
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    termsModel: "claude-haiku-5-5",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5-mini",
    models: ["gpt-5-mini"],
    termsModel: "gpt-5-nano",
  },
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash"],
    termsModel: "gemini-2.5-flash-lite",
  },
};

export function hostedProviders(
  server: ProviderInfo[],
  vault: Vault,
  discovered: (provider: KeyedProvider) => string[] | undefined,
): ProviderInfo[] {
  const held = new Set(vault.snapshot().keys.map((k) => k.provider));
  const keyed = KEYED_PROVIDERS.map((id): ProviderInfo => {
    const fallback = HOSTED_FALLBACKS[id];
    const found = discovered(id);
    const models = found ?? fallback.models;
    const defaultModel = models.includes(fallback.defaultModel)
      ? fallback.defaultModel
      : (models[0] ?? fallback.defaultModel);
    return {
      id,
      label: fallback.label,
      configured: held.has(id),
      models,
      defaultModel,
      termsModel: fallback.termsModel,
      supportsBatch: true,
    };
  });
  return [...keyed, ...server.filter((p) => p.id === "fake")];
}

const silentEvents = (): EventSourceLike => ({ onmessage: null, onerror: null, close: () => {} });

export function createHostedApi(base: Api, runtime: ClientRuntime, vault: Vault): Api {
  const settled = async (jobId: string) => runtime.overlay(await base.getJob(jobId));
  return {
    ...base,
    getJob: settled,
    async getWorkspace(bookId, targetLang) {
      return runtime.overlay(await base.getWorkspace(bookId, targetLang));
    },
    async listProviders() {
      const server = await base.listProviders().catch(() => []);
      return hostedProviders(server, vault, (p) => runtime.discoveredModels(p));
    },
    async translateChapter(jobId, chapterId, body) {
      await runtime.translateChapter(jobId, chapterId, body);
      return settled(jobId);
    },
    async translateAll(jobId, body) {
      await runtime.translateAll(jobId, body);
      return settled(jobId);
    },
    async retryChapter(jobId, chapterId, body) {
      runtime.abortChapter(jobId, chapterId);
      await base.clearChapter(jobId, chapterId);
      await runtime.translateChapter(jobId, chapterId, body);
      return settled(jobId);
    },
    async clearChapter(jobId, chapterId) {
      runtime.abortChapter(jobId, chapterId);
      await base.clearChapter(jobId, chapterId);
      return settled(jobId);
    },
    async cancelJob(jobId) {
      await runtime.cancel(jobId);
      return settled(jobId);
    },
    suggestGlossary: (bookId, body) => runtime.suggestGlossary(bookId, body),
    openJobEvents: silentEvents,
  };
}
