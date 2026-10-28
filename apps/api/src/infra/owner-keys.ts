import type { BlobStore } from "@et/core";

const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertOwner(ownerId: string): void {
  if (!OWNER.test(ownerId)) throw new Error("Invalid owner id");
}

export function assertOwnedKey(key: string): void {
  const [owner, ...rest] = key.split("/");
  if (
    !owner ||
    !OWNER.test(owner) ||
    rest.length === 0 ||
    !rest.every((s) => SAFE_SEGMENT.test(s))
  ) {
    throw new Error("Invalid blob key");
  }
}

export class OwnerScopedBlobs implements BlobStore {
  constructor(
    private readonly inner: BlobStore,
    private readonly ownerId: string,
  ) {
    assertOwner(ownerId);
  }

  private key(key: string): string {
    return `${this.ownerId}/${key}`;
  }

  put(key: string, bytes: Uint8Array): Promise<void> {
    return this.inner.put(this.key(key), bytes);
  }

  get(key: string): Promise<Uint8Array> {
    return this.inner.get(this.key(key));
  }

  delete(key: string): Promise<void> {
    return this.inner.delete(this.key(key));
  }
}
