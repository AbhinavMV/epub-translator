import { LOCAL_OWNER_ID } from "@et/contracts";
import type { Repositories, StoreFactory } from "@et/core";
import { SqliteBatchRepository } from "./batch-repo.ts";
import { SqliteBookRepository } from "./book-repo.ts";
import { SqliteBookSettingsRepository } from "./book-settings-repo.ts";
import type { Database } from "./db.ts";
import { SqliteJobRepository } from "./job-repo.ts";
import { SqliteProofreadRepository } from "./proofread-repo.ts";
import { SqliteTranslationRepository } from "./translation-repo.ts";

export class UnsupportedOwnerError extends Error {
  constructor(ownerId: string) {
    super(`SQLite store serves only the local owner, not ${ownerId}`);
    this.name = "UnsupportedOwnerError";
  }
}

export class SqliteStoreFactory implements StoreFactory {
  private readonly local: Repositories;

  constructor(db: Database) {
    this.local = {
      books: new SqliteBookRepository(db),
      settings: new SqliteBookSettingsRepository(db),
      jobs: new SqliteJobRepository(db),
      translations: new SqliteTranslationRepository(db),
      batches: new SqliteBatchRepository(db),
      proofreads: new SqliteProofreadRepository(db),
    };
  }

  forOwner(ownerId: string): Repositories {
    if (ownerId !== LOCAL_OWNER_ID) throw new UnsupportedOwnerError(ownerId);
    return this.local;
  }
}
