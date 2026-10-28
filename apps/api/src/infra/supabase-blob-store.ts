import type { BlobStore } from "@et/core";
import { BytesLru } from "./bytes-lru.ts";
import { assertOwnedKey } from "./owner-keys.ts";
import { BlobStorageError, type StorageClient } from "./storage-client.ts";

export const BOOKS_BUCKET = "books";
export const DEFAULT_EPUB_CACHE_BYTES = 64 * 1024 * 1024;

const EPUB_TYPE = "application/epub+zip";

export class SupabaseBlobStore implements BlobStore {
  private readonly cache: BytesLru;

  constructor(
    private readonly storage: StorageClient,
    cacheBytes = DEFAULT_EPUB_CACHE_BYTES,
    private readonly bucket = BOOKS_BUCKET,
  ) {
    this.cache = new BytesLru(cacheBytes);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    assertOwnedKey(key);
    const { error } = await this.storage
      .from(this.bucket)
      .upload(key, bytes, { contentType: EPUB_TYPE, upsert: true });
    if (error) throw new BlobStorageError("upload");
    this.cache.set(key, bytes);
  }

  async get(key: string): Promise<Uint8Array> {
    assertOwnedKey(key);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const { data, error } = await this.storage.from(this.bucket).download(key);
    if (error || !data) throw new BlobStorageError("download");
    const bytes = new Uint8Array(await data.arrayBuffer());
    this.cache.set(key, bytes);
    return bytes;
  }

  async delete(key: string): Promise<void> {
    assertOwnedKey(key);
    this.cache.delete(key);
    const { error } = await this.storage.from(this.bucket).remove([key]);
    if (error) throw new BlobStorageError("delete");
  }

  async adopt(from: string, to: string, bytes: Uint8Array): Promise<void> {
    assertOwnedKey(from);
    assertOwnedKey(to);
    await this.storage.from(this.bucket).remove([to]);
    this.cache.delete(to);
    const { error } = await this.storage.from(this.bucket).move(from, to);
    if (error) throw new BlobStorageError("move");
    this.cache.set(to, bytes);
  }
}
