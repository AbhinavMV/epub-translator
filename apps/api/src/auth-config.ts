import { z } from "zod";

const csv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  AUTH_MODE: z.enum(["none", "supabase"]).default("none"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  ADMIN_EMAILS: z.string().optional(),
  ALLOWED_HOSTS: z.string().optional(),
  APP_URL: z.string().url().optional(),
});

export type AuthConfig =
  | { mode: "none" }
  | {
      mode: "supabase";
      supabaseUrl: string;
      publishableKey: string;
      secretKey: string;
      adminEmails: ReadonlySet<string>;
      allowedHosts: string;
      appUrl: string | undefined;
    };

export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const parsed = EnvSchema.parse(env);
  if (parsed.AUTH_MODE === "none") return { mode: "none" };

  const missing: string[] = [];
  if (!parsed.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!parsed.SUPABASE_PUBLISHABLE_KEY) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (!parsed.SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY");
  const adminEmails = new Set(csv(parsed.ADMIN_EMAILS).map((e) => e.toLowerCase()));
  const hosts = csv(parsed.ALLOWED_HOSTS);
  if (adminEmails.size === 0) missing.push("ADMIN_EMAILS");
  if (hosts.length === 0) missing.push("ALLOWED_HOSTS");
  if (missing.length > 0) {
    throw new Error(`AUTH_MODE=supabase requires: ${missing.join(", ")}`);
  }
  return {
    mode: "supabase",
    supabaseUrl: parsed.SUPABASE_URL as string,
    publishableKey: parsed.SUPABASE_PUBLISHABLE_KEY as string,
    secretKey: parsed.SUPABASE_SECRET_KEY as string,
    adminEmails,
    allowedHosts: hosts.join(","),
    appUrl: parsed.APP_URL,
  };
}
