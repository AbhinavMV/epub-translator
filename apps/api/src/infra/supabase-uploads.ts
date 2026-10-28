import type { Clock } from "@et/core";
import { assertOwner } from "./owner-keys.ts";
import { BlobStorageError, type StorageClient } from "./storage-client.ts";
import { BOOKS_BUCKET, type SupabaseBlobStore } from "./supabase-blob-store.ts";

export class InvalidUploadPathError extends Error {
  constructor() {
    super("Invalid upload path");
    this.name = "InvalidUploadPathError";
  }
}

export interface SignedUploads {
  create(ownerId: string): Promise<{ path: string; token: string }>;
  read(ownerId: string, path: string): Promise<Uint8Array>;
  promote(ownerId: string, path: string, destination: string, bytes: Uint8Array): Promise<void>;
  discard(ownerId: string, path: string): Promise<void>;
  sweep(ownerId: string): Promise<void>;
}

export const INCOMING_MAX_AGE_MS = 2 * 3_600_000;

const INCOMING_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.epub$/i;

export class SupabaseSignedUploads implements SignedUploads {
  constructor(
    private readonly storage: StorageClient,
    private readonly blobs: SupabaseBlobStore,
    private readonly newId: () => string,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async create(ownerId: string): Promise<{ path: string; token: string }> {
    assertOwner(ownerId);
    const path = `${ownerId}/incoming/${this.newId()}.epub`;
    const { data, error } = await this.storage.from(BOOKS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new BlobStorageError("sign upload");
    return { path, token: data.token };
  }

  private check(ownerId: string, path: string): void {
    assertOwner(ownerId);
    const prefix = `${ownerId}/incoming/`;
    if (!path.startsWith(prefix) || !INCOMING_NAME.test(path.slice(prefix.length))) {
      throw new InvalidUploadPathError();
    }
  }

  async read(ownerId: string, path: string): Promise<Uint8Array> {
    this.check(ownerId, path);
    const { data, error } = await this.storage.from(BOOKS_BUCKET).download(path);
    if (error || !data) throw new InvalidUploadPathError();
    return new Uint8Array(await data.arrayBuffer());
  }

  async promote(
    ownerId: string,
    path: string,
    destination: string,
    bytes: Uint8Array,
  ): Promise<void> {
    this.check(ownerId, path);
    await this.blobs.adopt(path, destination, bytes);
  }

  async discard(ownerId: string, path: string): Promise<void> {
    this.check(ownerId, path);
    await this.storage.from(BOOKS_BUCKET).remove([path]);
  }

  async sweep(ownerId: string): Promise<void> {
    assertOwner(ownerId);
    try {
      const bucket = this.storage.from(BOOKS_BUCKET);
      const folder = `${ownerId}/incoming`;
      const { data } = await bucket.list(folder, { limit: 100 });
      const cutoff = this.clock.now().getTime() - INCOMING_MAX_AGE_MS;
      const stale = (data ?? [])
        .filter((o) => o.created_at && Date.parse(o.created_at) < cutoff)
        .map((o) => `${folder}/${o.name}`);
      if (stale.length > 0) await bucket.remove(stale);
    } catch {
      // Cleanup is opportunistic; the import itself must not depend on it.
    }
  }
}
