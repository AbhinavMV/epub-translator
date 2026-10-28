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
  RateLimiter,
  Repositories,
  StoreFactory,
  WorkLeaseFactory,
} from "@et/core";
import type { Database } from "@et/store-sqlite";
import type { JobEventBus } from "./infra/job-event-bus.ts";
import type { ExportStore } from "./infra/supabase-exports.ts";
import type { SignedUploads } from "./infra/supabase-uploads.ts";
import type { ProviderCatalog } from "./provider-catalog.ts";

export interface EpubAdapters {
  parser: EpubParser;
  assets: EpubAssets;
  renderer: ChapterRenderer;
  exporter: EpubExporter;
}

export interface Services extends EpubAdapters {
  factory: StoreFactory;
  leases: WorkLeaseFactory;
  ownerOf(request: Request): string | Promise<string>;
  blobs: BlobStore;
  blobsFor(ownerId: string): BlobStore;
  uploads?: SignedUploads;
  uploadLimiter?: RateLimiter;
  exports?: ExportStore;
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
