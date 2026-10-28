import { JobRunner } from "@et/core";
import { XmlChapterRenderer, YauzlEpubAssets, YauzlEpubParser, YazlEpubExporter } from "@et/epub";
import { buildProviderRegistry } from "@et/providers";
import {
  createPostgresSql,
  PostgresRateLimiter,
  PostgresStoreFactory,
  type Sql,
} from "@et/store-postgres";
import { z } from "zod";
import { type AppOptions, allowedHostsPolicy } from "./app.ts";
import { loadAuthConfig } from "./auth-config.ts";
import { composeAuth } from "./compose-auth.ts";
import { JobEventBus } from "./infra/job-event-bus.ts";
import { NodeHasher, nodeSleep, systemClock, uuidGenerator } from "./infra/node-system.ts";
import { OwnerScopedBlobs } from "./infra/owner-keys.ts";
import { PostgresAppUserAdapter, PostgresInviteAdapter } from "./infra/postgres-auth-adapters.ts";
import { PostgresWorkLeaseFactory } from "./infra/postgres-lease-adapter.ts";
import { createSupabaseStorage, type StorageClient } from "./infra/storage-client.ts";
import { SupabaseBlobStore } from "./infra/supabase-blob-store.ts";
import { SupabaseExportStore } from "./infra/supabase-exports.ts";
import { SupabaseSignedUploads } from "./infra/supabase-uploads.ts";
import { ProviderCatalog } from "./provider-catalog.ts";
import type { EpubAdapters, Services } from "./services.ts";

export const HOSTED_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const HostedEnvSchema = z.object({ DATABASE_URL: z.string().min(1) });

export interface HostedOverrides {
  sql?: Sql;
  storage?: StorageClient;
  epub?: EpubAdapters;
}

export interface HostedComposition {
  services: Services;
  options: AppOptions;
}

export function composeHosted(
  env: Record<string, string | undefined>,
  overrides: HostedOverrides = {},
): HostedComposition {
  const auth = loadAuthConfig(env);
  if (auth.mode !== "supabase") {
    throw new Error("Hosted mode requires AUTH_MODE=supabase");
  }
  const { DATABASE_URL } = HostedEnvSchema.parse({ DATABASE_URL: env.DATABASE_URL ?? "" });

  const sql = overrides.sql ?? createPostgresSql(DATABASE_URL);
  const storage = overrides.storage ?? createSupabaseStorage(auth.supabaseUrl, auth.secretKey);
  const factory = new PostgresStoreFactory(sql);
  const leases = new PostgresWorkLeaseFactory(factory);
  const blobs = new SupabaseBlobStore(storage);
  const events = new JobEventBus();
  const providers = new ProviderCatalog(buildProviderRegistry({}), false, true);
  const hasher = new NodeHasher();

  const services: Services = {
    factory,
    leases,
    ownerOf: () => {
      throw new Error("Hosted requests are always authenticated");
    },
    blobs,
    blobsFor: (ownerId) => new OwnerScopedBlobs(blobs, ownerId),
    uploads: new SupabaseSignedUploads(storage, blobs, () => uuidGenerator.next()),
    exports: new SupabaseExportStore(storage, systemClock),
    events,
    runner: new JobRunner({
      factory,
      leases,
      providers: (id) => providers.provider(id),
      events,
      sleep: nodeSleep,
      batch: {
        provider: (id) => providers.batchProvider(id),
        ids: uuidGenerator,
        clock: systemClock,
      },
    }),
    providers,
    ...(overrides.epub ?? {
      parser: new YauzlEpubParser(),
      assets: new YauzlEpubAssets(),
      renderer: new XmlChapterRenderer(),
      exporter: new YazlEpubExporter(systemClock),
    }),
    hasher,
    ids: uuidGenerator,
    clock: systemClock,
  };

  return {
    services,
    options: {
      allowHost: allowedHostsPolicy(auth.allowedHosts),
      auth: composeAuth(
        auth,
        {
          invites: new PostgresInviteAdapter(factory.invites),
          users: new PostgresAppUserAdapter(factory.appUsers),
          rateLimiter: new PostgresRateLimiter(sql, systemClock),
        },
        { hasher, clock: systemClock },
      ),
      events: false,
      config: {
        authMode: "supabase",
        supabaseUrl: auth.supabaseUrl,
        supabasePublishableKey: auth.publishableKey,
        clientExecution: true,
        uploadMode: "signed",
        maxUploadBytes: HOSTED_MAX_UPLOAD_BYTES,
      },
    },
  };
}
