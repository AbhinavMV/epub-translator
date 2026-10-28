import { bookBlobKey } from "@et/core";
import { describe, expect, it } from "vitest";
import { allowedHostsPolicy, createApp } from "../src/app.ts";
import { ADMIN_EMAIL, authHarness, localServices, multiOwnerServices } from "./auth-fakes.ts";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function hosted() {
  const h = authHarness();
  const services = multiOwnerServices();
  const app = createApp(services, { auth: h.auth });
  return { ...h, app, services };
}

describe("auth middleware", () => {
  it("rejects a request without a token", async () => {
    const { app } = hosted();
    expect((await app.request("/api/books")).status).toBe(401);
  });

  it("rejects an unknown token", async () => {
    const { app } = hosted();
    expect((await app.request("/api/books", { headers: bearer("bogus") })).status).toBe(401);
  });

  it("serves a valid token as that user's owner", async () => {
    const services = multiOwnerServices();
    const seen: string[] = [];
    const factory = services.factory;
    const app = createApp(
      {
        ...services,
        factory: {
          forOwner: (id) => {
            seen.push(id);
            return factory.forOwner(id);
          },
        },
      },
      { auth: authHarness().auth },
    );
    expect((await app.request("/api/books", { headers: bearer("user-token") })).status).toBe(200);
    expect(seen).toEqual(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
  });

  it("returns 403 for a disabled user", async () => {
    const { app, users } = hosted();
    await users.setDisabled("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", true);
    expect((await app.request("/api/books", { headers: bearer("user-token") })).status).toBe(403);
  });

  it("returns 403 for a valid identity with no app_users row", async () => {
    const { app, verifier } = hosted();
    verifier.tokens.set("stranger", { userId: "s-1", email: "stranger@example.com" });
    expect((await app.request("/api/books", { headers: bearer("stranger") })).status).toBe(403);
  });

  it("bootstraps an ADMIN_EMAILS user on first sign-in", async () => {
    const { app, verifier, users } = hosted();
    verifier.tokens.set("boot", { userId: "boot-1", email: ADMIN_EMAIL.toUpperCase() });
    expect((await app.request("/api/books", { headers: bearer("boot") })).status).toBe(200);
    expect(users.rows.get("boot-1")).toEqual({ id: "boot-1", role: "admin", disabled: false });
  });

  it("ignores tokens in the query string", async () => {
    const { app } = hosted();
    expect((await app.request("/api/books?access_token=user-token")).status).toBe(401);
    expect((await app.request("/api/books?token=user-token")).status).toBe(401);
  });

  it("adds no-store to api responses", async () => {
    const { app } = hosted();
    const res = await app.request("/api/books", { headers: bearer("user-token") });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await app.request("/api/books")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("session cookie", () => {
  it("is set from the bearer token with strict attributes", async () => {
    const { app } = hosted();
    const res = await app.request("/api/session", {
      method: "POST",
      headers: bearer("user-token"),
    });
    expect(res.status).toBe(204);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("et_session=user-token");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toContain("Path=/api/books");
  });

  it("requires a bearer token to be set", async () => {
    const { app } = hosted();
    const res = await app.request("/api/session", {
      method: "POST",
      headers: { cookie: "et_session=user-token" },
    });
    expect(res.status).toBe(401);
  });

  it("is cleared without needing a valid token", async () => {
    const { app } = hosted();
    const res = await app.request("/api/session", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/et_session=;/);
  });

  it("is honoured on GET cover and asset routes", async () => {
    const { app, services } = hosted();
    const book = await seedBook(services, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const cookie = { cookie: "et_session=user-token" };
    expect((await app.request(`/api/books/${book}/cover`, { headers: cookie })).status).toBe(200);
    expect(
      (await app.request(`/api/books/${book}/assets/cover.png`, { headers: cookie })).status,
    ).toBe(200);
  });

  it("is ignored on other routes and on non-GET methods", async () => {
    const { app, services } = hosted();
    const book = await seedBook(services, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const cookie = { cookie: "et_session=user-token" };
    expect((await app.request("/api/books", { headers: cookie })).status).toBe(401);
    expect((await app.request(`/api/books/${book}`, { headers: cookie })).status).toBe(401);
    expect(
      (await app.request(`/api/books/${book}`, { method: "DELETE", headers: cookie })).status,
    ).toBe(401);
    expect((await app.request("/api/me", { headers: cookie })).status).toBe(401);
  });

  it("does not fall back to the cookie when a bearer header is invalid", async () => {
    const { app, services } = hosted();
    const book = await seedBook(services, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const res = await app.request(`/api/books/${book}/cover`, {
      headers: { ...bearer("bogus"), cookie: "et_session=user-token" },
    });
    expect(res.status).toBe(401);
  });

  it("does not let one user's cookie read another user's book", async () => {
    const { app, services } = hosted();
    const book = await seedBook(services, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const res = await app.request(`/api/books/${book}/cover`, {
      headers: { cookie: "et_session=user-token" },
    });
    expect(res.status).toBe(404);
  });
});

describe("public routes", () => {
  it("serves config with only the publishable key", async () => {
    const { app } = hosted();
    const res = await app.request("/api/config");
    expect(await res.json()).toEqual({
      authMode: "supabase",
      supabaseUrl: "https://x.supabase.co",
      supabasePublishableKey: "sb_publishable_x",
      uploadMode: "multipart",
      maxUploadBytes: 200 * 1024 * 1024,
      clientExecution: true,
    });
  });

  it("reports auth mode none locally and leaves local mode open", async () => {
    const app = createApp(localServices());
    expect(await (await app.request("/api/config")).json()).toEqual({
      authMode: "none",
      supabaseUrl: null,
      supabasePublishableKey: null,
      uploadMode: "multipart",
      maxUploadBytes: 200 * 1024 * 1024,
      clientExecution: false,
    });
    expect((await app.request("/api/books")).status).toBe(200);
    expect((await app.request("/api/admin/users")).status).toBe(404);
    expect((await app.request("/api/books")).headers.get("cache-control")).toBeNull();
  });

  it("returns the current user from /api/me", async () => {
    const { app } = hosted();
    const me = await (await app.request("/api/me", { headers: bearer("admin-token") })).json();
    expect(me).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: ADMIN_EMAIL,
      role: "admin",
      isAdmin: true,
    });
  });
});

describe("host policy", () => {
  it("allows only listed hosts", () => {
    const allow = allowedHostsPolicy("app.example.com, other.vercel.app");
    expect(allow("app.example.com")).toBe(true);
    expect(allow("APP.example.com:443")).toBe(true);
    expect(allow("evil.example.net")).toBe(false);
    expect(allow("localhost:8787")).toBe(false);
  });

  it("rejects foreign hosts through createApp", async () => {
    const { auth } = authHarness();
    const app = createApp(localServices(), {
      auth,
      allowHost: allowedHostsPolicy("app.example.com"),
    });
    const bad = await app.request("https://evil.test/api/config", {
      headers: { host: "evil.test" },
    });
    expect(bad.status).toBe(403);
    const ok = await app.request("https://app.example.com/api/config", {
      headers: { host: "app.example.com" },
    });
    expect(ok.status).toBe(200);
  });
});

async function seedBook(services: ReturnType<typeof multiOwnerServices>, ownerId: string) {
  const sha256 = `sha-${ownerId}`;
  await services.factory.forOwner(ownerId).books.insert(
    {
      id: "book-1",
      sha256,
      title: "本",
      author: null,
      sourceLang: "ja",
      coverHref: "cover.png",
      createdAt: "2026-10-28T00:00:00Z",
    },
    {
      title: "本",
      author: null,
      sourceLang: "ja",
      coverHref: "cover.png",
      chapters: [],
      segments: [],
    },
  );
  await services.blobs.put(bookBlobKey(sha256), new Uint8Array([1]));
  return "book-1";
}
