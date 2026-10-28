import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "../src/auth-config.ts";
import { MemoryRateLimiter } from "../src/infra/memory-rate-limiter.ts";
import { type SupabaseAdminApi, SupabaseAuthAdmin } from "../src/infra/supabase-auth-admin.ts";
import { SupabaseIdentityVerifier } from "../src/infra/supabase-identity-verifier.ts";

const ISSUER = "https://proj.supabase.co/auth/v1";

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const other = await generateKeyPair("ES256");
  const sign = (
    claims: Record<string, unknown>,
    opts: { issuer?: string; audience?: string; exp?: string; key?: CryptoKey } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject("user-1")
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? "authenticated")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(opts.key ?? privateKey);
  return {
    verifier: new SupabaseIdentityVerifier({
      issuer: ISSUER,
      keys: createLocalJWKSet({ keys: [jwk] }),
    }),
    sign,
    otherKey: other.privateKey,
  };
}

describe("SupabaseIdentityVerifier", () => {
  it("accepts a valid token", async () => {
    const { verifier, sign } = await keys();
    expect(await verifier.verify(await sign({ email: "a@b.co" }))).toEqual({
      userId: "user-1",
      email: "a@b.co",
    });
  });

  it("rejects wrong issuer, audience, expiry, signer and garbage", async () => {
    const { verifier, sign, otherKey } = await keys();
    const claims = { email: "a@b.co" };
    expect(
      await verifier.verify(await sign(claims, { issuer: "https://evil/auth/v1" })),
    ).toBeNull();
    expect(await verifier.verify(await sign(claims, { audience: "anon" }))).toBeNull();
    expect(await verifier.verify(await sign(claims, { exp: "-1m" }))).toBeNull();
    expect(await verifier.verify(await sign(claims, { key: otherKey }))).toBeNull();
    expect(await verifier.verify("not.a.jwt")).toBeNull();
  });

  it("rejects tokens without an email (anonymous users)", async () => {
    const { verifier, sign } = await keys();
    expect(await verifier.verify(await sign({ is_anonymous: true }))).toBeNull();
  });

  it("rejects HS256 tokens", async () => {
    const { verifier } = await keys();
    const hs = await new SignJWT({ email: "a@b.co" })
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setSubject("user-1")
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("shared-secret-shared-secret-shared"));
    expect(await verifier.verify(hs)).toBeNull();
  });
});

describe("SupabaseAuthAdmin", () => {
  function fake() {
    const calls: { fn: string; args: unknown[] }[] = [];
    let fail = false;
    const respond =
      <T>(fn: string, data: T) =>
      async (...args: unknown[]) => {
        calls.push({ fn, args });
        return fail ? { data: null, error: { message: "secret detail" } } : { data, error: null };
      };
    const api = {
      createUser: respond("createUser", { user: { id: "u1" } }),
      deleteUser: respond("deleteUser", { user: null }),
      updateUserById: respond("updateUserById", { user: { id: "u1" } }),
      generateLink: respond("generateLink", { properties: { action_link: "https://x/verify" } }),
      listUsers: respond("listUsers", {
        users: [{ id: "u1", email: "a@b.co" }, { id: "u2" }],
      }),
    } as unknown as SupabaseAdminApi;
    return { api, calls, failNext: () => (fail = true) };
  }

  it("creates confirmed users", async () => {
    const { api, calls } = fake();
    expect(await new SupabaseAuthAdmin(api).createUser("a@b.co", "pw-pw-pw-pw-pw")).toEqual({
      id: "u1",
    });
    expect(calls[0]?.args[0]).toEqual({
      email: "a@b.co",
      password: "pw-pw-pw-pw-pw",
      email_confirm: true,
    });
  });

  it("bans and unbans through ban_duration", async () => {
    const { api, calls } = fake();
    const admin = new SupabaseAuthAdmin(api);
    await admin.banUser("u1", true);
    await admin.banUser("u1", false);
    expect(calls.map((c) => c.args[1])).toEqual([
      { ban_duration: "876000h" },
      { ban_duration: "none" },
    ]);
  });

  it("returns the recovery action link, with the redirect when configured", async () => {
    const { api, calls } = fake();
    const link = await new SupabaseAuthAdmin(api, {
      recoveryRedirectTo: "https://app.test/",
    }).recoveryLink("a@b.co");
    expect(link).toBe("https://x/verify");
    expect(calls[0]?.args[0]).toEqual({
      type: "recovery",
      email: "a@b.co",
      options: { redirectTo: "https://app.test/" },
    });
  });

  it("lists only users that have an email", async () => {
    const { api } = fake();
    expect(await new SupabaseAuthAdmin(api).listUsers()).toEqual([{ id: "u1", email: "a@b.co" }]);
  });

  it("maps provider errors to a generic message", async () => {
    const { api, failNext } = fake();
    failNext();
    await expect(new SupabaseAuthAdmin(api).createUser("a@b.co", "pw")).rejects.toThrow(
      "Auth provider request failed",
    );
  });
});

describe("loadAuthConfig", () => {
  const full = {
    AUTH_MODE: "supabase",
    SUPABASE_URL: "https://proj.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    SUPABASE_SECRET_KEY: "sb_secret_x",
    ADMIN_EMAILS: "Admin@Example.com, b@example.com",
    ALLOWED_HOSTS: "app.example.com",
  };

  it("defaults to none", () => {
    expect(loadAuthConfig({})).toEqual({ mode: "none" });
  });

  it("parses supabase mode", () => {
    const cfg = loadAuthConfig(full);
    expect(cfg.mode === "supabase" && [...cfg.adminEmails]).toEqual([
      "admin@example.com",
      "b@example.com",
    ]);
  });

  it("fails closed when a required variable is missing", () => {
    expect(() => loadAuthConfig({ ...full, ALLOWED_HOSTS: "" })).toThrow(/ALLOWED_HOSTS/);
    expect(() => loadAuthConfig({ ...full, ADMIN_EMAILS: undefined })).toThrow(/ADMIN_EMAILS/);
    expect(() => loadAuthConfig({ ...full, SUPABASE_SECRET_KEY: undefined })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
  });

  it("never echoes secret values in errors", () => {
    try {
      loadAuthConfig({ ...full, ALLOWED_HOSTS: "" });
    } catch (e) {
      expect(String(e)).not.toContain("sb_secret_x");
    }
  });
});

describe("MemoryRateLimiter", () => {
  it("allows up to the limit per key within the window", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter({ now: () => new Date(now) }, 2, 1000);
    expect(await limiter.allow("a")).toBe(true);
    expect(await limiter.allow("a")).toBe(true);
    expect(await limiter.allow("a")).toBe(false);
    expect(await limiter.allow("b")).toBe(true);
    now = 1500;
    expect(await limiter.allow("a")).toBe(true);
  });
});
