import type { AppConfig, Me } from "@et/contracts";
import { Hono } from "hono";
import { type AuthDeps, isAdmin } from "./auth.ts";
import type { AppEnv } from "./request-context.ts";

export function configRoutes(auth: AuthDeps | undefined) {
  const config: AppConfig = auth
    ? {
        authMode: "supabase",
        supabaseUrl: auth.publicConfig.supabaseUrl,
        supabasePublishableKey: auth.publicConfig.supabasePublishableKey,
      }
    : { authMode: "none", supabaseUrl: null, supabasePublishableKey: null };
  return new Hono<AppEnv>().get("/", (c) => c.json(config));
}

export function meRoutes(auth: AuthDeps) {
  return new Hono<AppEnv>().get("/", (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const me: Me = { ...user, isAdmin: isAdmin(user, auth.adminEmails) };
    return c.json(me);
  });
}
