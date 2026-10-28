import type { Repositories, StoreFactory } from "@et/core";
import { PostgresAppUserRepository } from "./app-user-repo.ts";
import { PostgresBatchRepository } from "./batch-repo.ts";
import { PostgresBookRepository } from "./book-repo.ts";
import { PostgresBookSettingsRepository } from "./book-settings-repo.ts";
import { PostgresInviteRepository } from "./invite-repo.ts";
import { PostgresJobRepository } from "./job-repo.ts";
import { ParsedBookCache } from "./parsed-cache.ts";
import type { Sql } from "./sql.ts";
import { PostgresTranslationRepository } from "./translation-repo.ts";
import { PostgresWorkLeaseRepository, type WorkLeaseOptions } from "./work-lease-repo.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidOwnerError extends Error {
  constructor() {
    super("owner id must be a uuid");
    this.name = "InvalidOwnerError";
  }
}

export interface PostgresStoreOptions extends WorkLeaseOptions {
  parsedCacheSize?: number;
}

export class PostgresStoreFactory implements StoreFactory {
  readonly invites: PostgresInviteRepository;
  readonly appUsers: PostgresAppUserRepository;
  private readonly cache: ParsedBookCache;

  constructor(
    private readonly sql: Sql,
    private readonly options: PostgresStoreOptions = {},
  ) {
    this.cache = new ParsedBookCache(options.parsedCacheSize);
    this.invites = new PostgresInviteRepository(sql);
    this.appUsers = new PostgresAppUserRepository(sql);
  }

  forOwner(ownerId: string): Repositories & { books: PostgresBookRepository } {
    assertOwner(ownerId);
    return {
      books: new PostgresBookRepository(this.sql, ownerId, this.cache),
      settings: new PostgresBookSettingsRepository(this.sql, ownerId),
      jobs: new PostgresJobRepository(this.sql, ownerId),
      translations: new PostgresTranslationRepository(this.sql, ownerId),
      batches: new PostgresBatchRepository(this.sql, ownerId),
    };
  }

  leasesForOwner(ownerId: string): PostgresWorkLeaseRepository {
    assertOwner(ownerId);
    return new PostgresWorkLeaseRepository(this.sql, ownerId, this.options);
  }
}

function assertOwner(ownerId: string): void {
  if (!UUID.test(ownerId)) throw new InvalidOwnerError();
}
