import type { ProviderId, ProviderInfo } from "@et/contracts";
import type { BatchTranslationProvider, TermExtractor, TranslationProvider } from "@et/core";
import { type ProviderRegistry, resolveDefaultModel } from "@et/providers";

const LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  gemini: "Google Gemini",
  fake: "Offline test (no translation)",
};

const KNOWN_MODELS: Partial<Record<ProviderId, string[]>> = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
};

export class ProviderCatalog {
  private cache: Promise<ProviderInfo[]> | null = null;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly discoverModels: boolean,
  ) {}

  provider(id: ProviderId): TranslationProvider | null {
    return this.registry.get(id)?.provider ?? null;
  }

  termExtractor(id: ProviderId): TermExtractor | null {
    return this.registry.get(id)?.terms ?? null;
  }

  batchProvider(id: ProviderId): BatchTranslationProvider | null {
    return this.registry.get(id)?.batch ?? null;
  }

  list(): Promise<ProviderInfo[]> {
    this.cache ??= this.load().catch((err) => {
      this.cache = null;
      throw err;
    });
    return this.cache;
  }

  private async load(): Promise<ProviderInfo[]> {
    return Promise.all(
      [...this.registry].map(async ([id, entry]) => {
        if (!entry.configured || !entry.provider) {
          return {
            id,
            label: LABELS[id],
            configured: false,
            models: [],
            defaultModel: entry.defaultModel,
            supportsBatch: false,
          };
        }
        const models = await this.modelsFor(id, entry.provider, entry.defaultModel);
        const defaultModel =
          (await resolveDefaultModel({
            ...entry,
            defaultModel: entry.defaultModel || (models[0] ?? ""),
          })) || "";
        return {
          id,
          label: LABELS[id],
          configured: true,
          models,
          defaultModel,
          ...(entry.terms && entry.termsModel ? { termsModel: entry.termsModel } : {}),
          supportsBatch: Boolean(entry.batch),
        };
      }),
    );
  }

  private async modelsFor(
    id: ProviderId,
    provider: TranslationProvider,
    defaultModel: string,
  ): Promise<string[]> {
    const fallback = KNOWN_MODELS[id] ?? (defaultModel ? [defaultModel] : []);
    if (id !== "fake" && !this.discoverModels) return withDefault(fallback, defaultModel);
    try {
      const discovered = await provider.listModels();
      return withDefault(discovered.length > 0 ? discovered : fallback, defaultModel);
    } catch {
      return withDefault(fallback, defaultModel);
    }
  }
}

function withDefault(models: string[], defaultModel: string): string[] {
  return defaultModel && !models.includes(defaultModel) ? [defaultModel, ...models] : models;
}
