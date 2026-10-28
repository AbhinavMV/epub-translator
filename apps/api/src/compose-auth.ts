import type { AppUserRepository, Clock, Hasher, InviteRepository, RateLimiter } from "@et/core";
import type { AuthConfig } from "./auth-config.ts";
import type { AuthDeps } from "./http/auth.ts";
import { MemoryRateLimiter } from "./infra/memory-rate-limiter.ts";
import { createSupabaseAuthAdmin } from "./infra/supabase-auth-admin.ts";
import { createSupabaseIdentityVerifier } from "./infra/supabase-identity-verifier.ts";

export interface AuthRepositories {
  invites: InviteRepository;
  users: AppUserRepository;
  rateLimiter?: RateLimiter;
}

export function composeAuth(
  config: Extract<AuthConfig, { mode: "supabase" }>,
  repos: AuthRepositories,
  system: { hasher: Hasher; clock: Clock },
): AuthDeps {
  return {
    verifier: createSupabaseIdentityVerifier(config.supabaseUrl),
    admin: createSupabaseAuthAdmin(config.supabaseUrl, config.secretKey, {
      recoveryRedirectTo: config.appUrl,
    }),
    invites: repos.invites,
    users: repos.users,
    random: { bytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    hasher: system.hasher,
    clock: system.clock,
    rateLimiter: repos.rateLimiter ?? new MemoryRateLimiter(system.clock),
    adminEmails: config.adminEmails,
    publicConfig: {
      supabaseUrl: config.supabaseUrl,
      supabasePublishableKey: config.publishableKey,
    },
  };
}
