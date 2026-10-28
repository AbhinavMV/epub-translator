import type {
  BlobStore,
  ChapterRenderer,
  Clock,
  EpubAssets,
  EpubExporter,
  EpubParser,
  Hasher,
  IdGenerator,
  JobRunner,
  Repositories,
  StoreFactory,
} from "@et/core";
import type { Database } from "@et/store-sqlite";
import type { JobEventBus } from "./infra/job-event-bus.ts";
import type { ProviderCatalog } from "./provider-catalog.ts";

export interface EpubAdapters {
  parser: EpubParser;
  assets: EpubAssets;
  renderer: ChapterRenderer;
  exporter: EpubExporter;
}

export interface Services extends EpubAdapters {
  factory: StoreFactory;
  ownerOf(request: Request): string | Promise<string>;
  blobs: BlobStore;
  events: JobEventBus;
  runner: JobRunner;
  providers: ProviderCatalog;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
}

export interface LocalServices extends Services {
  db: Database;
  repos: Repositories;
}
