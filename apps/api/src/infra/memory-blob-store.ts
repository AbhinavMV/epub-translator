import type { BlobStore } from "@et/core";

export class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.blobs.set(key, bytes);
  }

  async get(key: string): Promise<Uint8Array> {
    const bytes = this.blobs.get(key);
    if (!bytes) throw new Error(`Blob not found: ${key}`);
    return bytes;
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}
