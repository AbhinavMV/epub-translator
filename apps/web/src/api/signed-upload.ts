import { createClient } from "@supabase/supabase-js";
import type { SignedUploader } from "./client";

const BOOKS_BUCKET = "books";

export function createSupabaseUploader(url: string, publishableKey: string): SignedUploader {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async (path, token, file) => {
    const { error } = await client.storage
      .from(BOOKS_BUCKET)
      .uploadToSignedUrl(path, token, file, { contentType: "application/epub+zip" });
    if (error) throw new Error("upload failed");
  };
}
