import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_OWNER_ID } from "@et/contracts";
import type { BatchTranslationProvider, BlobStore, TranslationProvider } from "@et/core";
import { JobRunner } from "@et/core";
import { XmlChapterRenderer, YauzlEpubAssets, YauzlEpubParser, YazlEpubExporter } from "@et/epub";
import {
  buildProviderRegistry,
  FakeBatchProvider,
  FakeProvider,
  FakeTermExtractor,
} from "@et/providers";
import { openDatabase, SqliteStoreFactory } from "@et/store-sqlite";
import { FsBlobStore } from "./infra/fs-blob-store.ts";
import { JobEventBus } from "./infra/job-event-bus.ts";
import { MemoryBlobStore } from "./infra/memory-blob-store.ts";
import { NodeHasher, nodeSleep, systemClock, uuidGenerator } from "./infra/node-system.ts";
import { ProviderCatalog } from "./provider-catalog.ts";
import type { EpubAdapters, LocalServices } from "./services.ts";

export interface LocalServiceOptions {
  /** ":memory:" keeps everything in memory (tests). */
  dataDir: string;
  env: Record<string, string | undefined>;
  epub: EpubAdapters;
  fakeProvider?: TranslationProvider;
  fakeBatchProvider?: BatchTranslationProvider;
  discoverModels?: boolean;
}

export function createLocalServices(options: LocalServiceOptions): LocalServices {
  const inMemory = options.dataDir === ":memory:";
  const db = openDatabase(inMemory ? ":memory:" : join(options.dataDir, "translator.db"));
  const blobs: BlobStore = inMemory ? new MemoryBlobStore() : new FsBlobStore(options.dataDir);
  const registry = buildProviderRegistry(options.env);
  if (options.fakeProvider) {
    registry.set("fake", {
      provider: options.fakeProvider,
      batch: options.fakeBatchProvider ?? registry.get("fake")?.batch ?? new FakeBatchProvider(),
      configured: true,
      defaultModel: "fake-echo",
      terms: new FakeTermExtractor(),
      termsModel: "fake-echo",
    });
  }
  const providers = new ProviderCatalog(registry, options.discoverModels ?? false);
  const factory = new SqliteStoreFactory(db);
  const events = new JobEventBus();
  const runner = new JobRunner({
    factory,
    providers: (id) => providers.provider(id),
    events,
    sleep: nodeSleep,
    batch: {
      provider: (id) => providers.batchProvider(id),
      ids: uuidGenerator,
      clock: systemClock,
    },
  });
  return {
    db,
    factory,
    repos: factory.forOwner(LOCAL_OWNER_ID),
    ownerOf: () => LOCAL_OWNER_ID,
    blobs,
    events,
    runner,
    providers,
    ...options.epub,
    hasher: new NodeHasher(),
    ids: uuidGenerator,
    clock: systemClock,
  };
}

export function composeLocalServices(options: {
  dataDir: string;
  env: Record<string, string | undefined>;
  discoverModels?: boolean;
}): LocalServices {
  if (options.dataDir !== ":memory:") mkdirSync(options.dataDir, { recursive: true });
  const fakeDelayMs = Number(options.env.FAKE_PROVIDER_DELAY_MS ?? 300);
  return createLocalServices({
    dataDir: options.dataDir,
    env: options.env,
    discoverModels: options.discoverModels ?? true,
    ...(options.env.ENABLE_FAKE_PROVIDER === "1"
      ? {
          fakeProvider: new FakeProvider({
            delayMs: Number.isFinite(fakeDelayMs) ? fakeDelayMs : 0,
          }),
        }
      : {}),
    epub: {
      parser: new YauzlEpubParser(),
      assets: new YauzlEpubAssets(),
      renderer: new XmlChapterRenderer(),
      exporter: new YazlEpubExporter(systemClock),
    },
  });
}
