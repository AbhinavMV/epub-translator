import { createClient } from "@supabase/supabase-js";

interface StorageError {
  message: string;
}

export interface StorageBucketApi {
  upload(
    path: string,
    body: Uint8Array,
    options: { contentType: string; upsert: boolean },
  ): Promise<{ error: StorageError | null }>;
  download(path: string): Promise<{ data: Blob | null; error: StorageError | null }>;
  remove(paths: string[]): Promise<{ error: StorageError | null }>;
  move(from: string, to: string): Promise<{ error: StorageError | null }>;
  createSignedUploadUrl(
    path: string,
  ): Promise<{ data: { path: string; token: string } | null; error: StorageError | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
    options: { download: string },
  ): Promise<{ data: { signedUrl: string } | null; error: StorageError | null }>;
  list(
    folder: string,
    options: { limit: number },
  ): Promise<{
    data: { name: string; created_at?: string | null }[] | null;
    error: StorageError | null;
  }>;
}

export interface StorageClient {
  from(bucket: string): StorageBucketApi;
}

export class BlobStorageError extends Error {
  constructor(operation: string) {
    super(`Storage ${operation} failed`);
    this.name = "BlobStorageError";
  }
}

export function createSupabaseStorage(supabaseUrl: string, secretKey: string): StorageClient {
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
}
