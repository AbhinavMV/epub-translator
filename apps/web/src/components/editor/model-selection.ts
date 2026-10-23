import type { BookSettings, ProviderId, ProviderInfo } from "@et/contracts";

export interface Selection {
  provider: ProviderId;
  model: string;
}

export const ENV_KEYS: Record<ProviderId, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  fake: null,
};

export function envHint(provider: ProviderInfo): string {
  const key = ENV_KEYS[provider.id];
  return key ? `Set ${key} in apps/api/.env` : "Unavailable";
}

export function resolveSelection(
  settings: Pick<BookSettings, "provider" | "model"> | undefined,
  providers: ProviderInfo[] | undefined,
): Selection | null {
  if (!providers) return null;
  const saved = providers.find((p) => p.id === settings?.provider && p.configured);
  if (saved) {
    return { provider: saved.id, model: settings?.model || saved.defaultModel };
  }
  const first =
    providers.find((p) => p.configured && p.id !== "fake") ?? providers.find((p) => p.configured);
  return first ? { provider: first.id, model: first.defaultModel } : null;
}
