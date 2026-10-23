import { join } from "node:path";
import type {
  BlobStore,
  ChapterRenderer,
  EpubAssets,
  EpubExporter,
  EpubParser,
  TranslationProvider,
} from "@et/core";
import { JobRunner } from "@et/core";
import { buildProviderRegistry } from "@et/providers";
import {
  openDatabase,
  SqliteBookRepository,
  SqliteBookSettingsRepository,
  SqliteJobRepository,
  SqliteTranslationRepository,
} from "@et/store-sqlite";
import { FsBlobStore } from "./infra/fs-blob-store.ts";
import { JobEventBus } from "./infra/job-event-bus.ts";
import { MemoryBlobStore } from "./infra/memory-blob-store.ts";
import { NodeHasher, nodeSleep, systemClock, uuidGenerator } from "./infra/node-system.ts";
import { ProviderCatalog } from "./provider-catalog.ts";

export interface EpubAdapters {
  parser: EpubParser;
  assets: EpubAssets;
  renderer: ChapterRenderer;
  exporter: EpubExporter;
}

export interface ServiceOptions {
  /** ":memory:" keeps everything in memory (tests). */
  dataDir: string;
  env: Record<string, string | undefined>;
  epub: EpubAdapters;
  fakeProvider?: TranslationProvider;
  discoverModels?: boolean;
}

export function createServices(options: ServiceOptions) {
  const inMemory = options.dataDir === ":memory:";
  const db = openDatabase(inMemory ? ":memory:" : join(options.dataDir, "translator.db"));
  const blobs: BlobStore = inMemory ? new MemoryBlobStore() : new FsBlobStore(options.dataDir);
  const registry = buildProviderRegistry(options.env);
  if (options.fakeProvider) {
    registry.set("fake", {
      provider: options.fakeProvider,
      configured: true,
      defaultModel: "fake-echo",
    });
  }
  const providers = new ProviderCatalog(registry, options.discoverModels ?? false);
  const books = new SqliteBookRepository(db);
  const settings = new SqliteBookSettingsRepository(db);
  const jobs = new SqliteJobRepository(db);
  const translations = new SqliteTranslationRepository(db);
  const events = new JobEventBus();
  const runner = new JobRunner({
    books,
    jobs,
    translations,
    settings,
    providers: (id) => providers.provider(id),
    events,
    sleep: nodeSleep,
  });
  return {
    db,
    blobs,
    books,
    settings,
    jobs,
    translations,
    events,
    runner,
    providers,
    ...options.epub,
    hasher: new NodeHasher(),
    ids: uuidGenerator,
    clock: systemClock,
  };
}

export type Services = ReturnType<typeof createServices>;
