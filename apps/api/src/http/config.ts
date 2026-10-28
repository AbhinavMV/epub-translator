import type { PublicConfig } from "@et/contracts";
import { Hono } from "hono";
import type { AuthDeps } from "./auth.ts";

export const LOCAL_PUBLIC_CONFIG: PublicConfig = {
  authMode: "none",
  supabaseUrl: null,
  supabasePublishableKey: null,
  clientExecution: false,
  uploadMode: "multipart",
  maxUploadBytes: 200 * 1024 * 1024,
};

export function publicConfig(base: PublicConfig, auth: AuthDeps | undefined): PublicConfig {
  if (!auth) return base;
  return {
    authMode: "supabase",
    supabaseUrl: auth.publicConfig.supabaseUrl,
    supabasePublishableKey: auth.publicConfig.supabasePublishableKey,
    clientExecution: true,
    uploadMode: base.uploadMode,
    maxUploadBytes: base.maxUploadBytes,
  };
}

export function configRoutes(config: PublicConfig) {
  return new Hono().get("/", (c) => c.json(config));
}
