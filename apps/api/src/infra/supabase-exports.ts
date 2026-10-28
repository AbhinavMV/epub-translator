import type { Clock } from "@et/core";
import { assertOwner } from "./owner-keys.ts";
import { BlobStorageError, type StorageClient } from "./storage-client.ts";

export const EXPORTS_BUCKET = "exports";
export const EXPORT_URL_TTL_SECONDS = 300;
export const EXPORT_MAX_AGE_MS = 24 * 3_600_000;

export interface PublishedExport {
  name: string;
  bytes: Uint8Array;
  contentType: string;
  downloadName: string;
}

export interface ExportStore {
  publish(ownerId: string, file: PublishedExport): Promise<{ url: string }>;
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class SupabaseExportStore implements ExportStore {
  constructor(
    private readonly storage: StorageClient,
    private readonly clock: Clock,
  ) {}

  async publish(ownerId: string, file: PublishedExport): Promise<{ url: string }> {
    assertOwner(ownerId);
    if (!SAFE_NAME.test(file.name)) throw new Error("Invalid export name");
    const bucket = this.storage.from(EXPORTS_BUCKET);
    const path = `${ownerId}/exports/${file.name}`;
    const up = await bucket.upload(path, file.bytes, {
      contentType: file.contentType,
      upsert: true,
    });
    if (up.error) throw new BlobStorageError("export upload");
    const signed = await bucket.createSignedUrl(path, EXPORT_URL_TTL_SECONDS, {
      download: file.downloadName,
    });
    if (signed.error || !signed.data) throw new BlobStorageError("export sign");
    await this.sweep(ownerId, path);
    return { url: signed.data.signedUrl };
  }

  private async sweep(ownerId: string, keep: string): Promise<void> {
    try {
      const bucket = this.storage.from(EXPORTS_BUCKET);
      const folder = `${ownerId}/exports`;
      const { data } = await bucket.list(folder, { limit: 100 });
      const cutoff = this.clock.now().getTime() - EXPORT_MAX_AGE_MS;
      const stale = (data ?? [])
        .filter((o) => o.created_at && Date.parse(o.created_at) < cutoff)
        .map((o) => `${folder}/${o.name}`)
        .filter((p) => p !== keep);
      if (stale.length > 0) await bucket.remove(stale);
    } catch {
      // Cleanup is opportunistic; the export itself already succeeded.
    }
  }
}
