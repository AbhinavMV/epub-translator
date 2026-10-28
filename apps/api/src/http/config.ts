import type { PublicConfig } from "@et/contracts";
import { Hono } from "hono";
import type { AuthDeps } from "./auth.ts";

export const LOCAL_PUBLIC_CONFIG: PublicConfig = {
  authMode: "none",
  supabaseUrl: null,
  supabasePublishableKey: null,
  clientExecution: false,
};

export function publicConfig(base: PublicConfig, auth: AuthDeps | undefined): PublicConfig {
  if (!auth) return base;
  return {
    authMode: "supabase",
    supabaseUrl: auth.publicConfig.supabaseUrl,
    supabasePublishableKey: auth.publicConfig.supabasePublishableKey,
    clientExecution: true,
  };
}

export function configRoutes(config: PublicConfig) {
  return new Hono().get("/", (c) => c.json(config));
}
