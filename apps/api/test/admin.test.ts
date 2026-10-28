import {
  CreatedInviteSchema,
  InviteSummarySchema,
  MeSchema,
  UserSummarySchema,
} from "@et/contracts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { authHarness, multiOwnerServices } from "./auth-fakes.ts";

const json = (token: string | null, body?: unknown, method = "POST") => ({
  method,
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const as = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

function setup(rateLimiter?: { allow(key: string): Promise<boolean> }) {
  const h = authHarness();
  if (rateLimiter) h.auth.rateLimiter = rateLimiter;
  const app = createApp(multiOwnerServices(), { auth: h.auth });
  return { ...h, app };
}

describe("admin guard", () => {
  it("rejects non-admin users on every admin route", async () => {
    const { app } = setup();
    for (const [method, path] of [
      ["GET", "/api/admin/invites"],
      ["POST", "/api/admin/invites"],
      ["DELETE", "/api/admin/invites/cccccccc-cccc-4ccc-8ccc-000000000001"],
      ["GET", "/api/admin/users"],
      ["POST", "/api/admin/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/disable"],
      ["POST", "/api/admin/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/reset-link"],
      ["DELETE", "/api/admin/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ] as const) {
      const res = await app.request(path, { method, headers: as("user-token").headers });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("requires both the ADMIN_EMAILS entry and the admin role", async () => {
    const { app, users, verifier } = setup();
    users.rows.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "admin", disabled: false });
    expect((await app.request("/api/admin/users", as("user-token"))).status).toBe(403);
    verifier.tokens.set("admin-token", { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "admin@example.com" });
    users.rows.set("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "user", disabled: false });
    expect((await app.request("/api/admin/users", as("admin-token"))).status).toBe(403);
  });

  it("reports isAdmin false for a non-admin on /api/me", async () => {
    const { app } = setup();
    const me = MeSchema.parse(await (await app.request("/api/me", as("user-token"))).json());
    expect(me.isAdmin).toBe(false);
  });
});

describe("invites", () => {
  it("creates an invite, returning the token once and storing only its hash", async () => {
    const { app, invites } = setup();
    const res = await app.request(
      "/api/admin/invites",
      json("admin-token", { email: "New@Example.com", expiresInHours: 24 }),
    );
    expect(res.status).toBe(201);
    const { invite, token } = CreatedInviteSchema.parse(await res.json());
    expect(invite.email).toBe("new@example.com");
    expect(invite.status).toBe("pending");
    const stored = [...invites.rows.values()][0];
    expect(stored?.tokenHash).not.toBe(token);
    const listed = await (await app.request("/api/admin/invites", as("admin-token"))).json();
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(JSON.stringify(listed)).not.toContain(stored?.tokenHash ?? "unreachable");
  });

  it("lists pending, used and expired invites and revokes", async () => {
    const { app, invites } = setup();
    const create = async (hours: number) =>
      CreatedInviteSchema.parse(
        await (
          await app.request("/api/admin/invites", json("admin-token", { expiresInHours: hours }))
        ).json(),
      );
    const pending = await create(24);
    const used = await create(24);
    const expired = await create(1);
    Object.assign(invites.rows.get(used.invite.id) ?? {}, {
      usedAt: new Date("2026-10-28T00:00:00Z"),
    });
    Object.assign(invites.rows.get(expired.invite.id) ?? {}, {
      expiresAt: new Date("2026-10-27T00:00:00Z"),
    });
    const list = (await (
      await app.request("/api/admin/invites", as("admin-token"))
    ).json()) as unknown[];
    const statuses = Object.fromEntries(
      list.map((i) => InviteSummarySchema.parse(i)).map((i) => [i.id, i.status]),
    );
    expect(statuses).toEqual({
      [pending.invite.id]: "pending",
      [used.invite.id]: "used",
      [expired.invite.id]: "expired",
    });
    const del = await app.request(`/api/admin/invites/${pending.invite.id}`, {
      method: "DELETE",
      ...as("admin-token"),
    });
    expect(del.status).toBe(204);
    expect(invites.rows.has(pending.invite.id)).toBe(false);
  });

  it("rejects a malformed create body", async () => {
    const { app } = setup();
    const res = await app.request("/api/admin/invites", json("admin-token", { email: "nope" }));
    expect(res.status).toBe(400);
  });
});

describe("accept invite", () => {
  const password = "correct horse battery";

  async function issue(app: ReturnType<typeof setup>["app"], body: object = {}) {
    const res = await app.request("/api/admin/invites", json("admin-token", body));
    return CreatedInviteSchema.parse(await res.json()).token;
  }

  it("works without authentication and creates the account", async () => {
    const { app, admin, users } = setup();
    const token = await issue(app);
    const res = await app.request(
      "/api/invites/accept",
      json(null, { token, email: "new@example.com", password }),
    );
    expect(res.status).toBe(201);
    expect([...admin.accounts.values()].some((a) => a.email === "new@example.com")).toBe(true);
    expect([...users.rows.values()].filter((u) => u.role === "user")).toHaveLength(2);
    expect(JSON.stringify(await res.clone().text())).not.toContain(password);
  });

  it("is single use", async () => {
    const { app } = setup();
    const token = await issue(app);
    const body = { token, email: "a@example.com", password };
    expect((await app.request("/api/invites/accept", json(null, body))).status).toBe(201);
    expect((await app.request("/api/invites/accept", json(null, body))).status).toBe(400);
  });

  it("rejects short passwords", async () => {
    const { app } = setup();
    const token = await issue(app);
    const res = await app.request(
      "/api/invites/accept",
      json(null, { token, email: "a@example.com", password: "short" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects the wrong email for a bound invite", async () => {
    const { app } = setup();
    const token = await issue(app, { email: "bound@example.com" });
    const res = await app.request(
      "/api/invites/accept",
      json(null, { token, email: "other@example.com", password }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 422 and keeps the invite usable when account creation fails", async () => {
    const { app, admin } = setup();
    const token = await issue(app);
    admin.failCreate = true;
    const body = { token, email: "a@example.com", password };
    expect((await app.request("/api/invites/accept", json(null, body))).status).toBe(422);
    admin.failCreate = false;
    expect((await app.request("/api/invites/accept", json(null, body))).status).toBe(201);
  });

  it("returns 429 when the per-ip limit is hit", async () => {
    const seen: string[] = [];
    const { app } = setup({
      allow: async (key) => {
        seen.push(key);
        return false;
      },
    });
    const res = await app.request("/api/invites/accept", {
      ...json(null, { token: "t", email: "a@example.com", password }),
      headers: { "content-type": "application/json", "x-real-ip": "9.9.9.9" },
    });
    expect(res.status).toBe(429);
    expect(seen).toEqual(["invite-accept:9.9.9.9"]);
  });
});

describe("malformed ids", () => {
  it("answers 404 for a non-uuid id without reaching the store", async () => {
    const { app, invites } = setup();
    const revoke = invites.revoke.bind(invites);
    const revoked: string[] = [];
    invites.revoke = async (id: string) => {
      revoked.push(id);
      return revoke(id);
    };
    for (const [method, path] of [
      ["DELETE", "/api/admin/invites/not-a-uuid"],
      ["POST", "/api/admin/users/not-a-uuid/disable"],
      ["POST", "/api/admin/users/not-a-uuid/enable"],
      ["POST", "/api/admin/users/not-a-uuid/reset-link"],
      ["DELETE", "/api/admin/users/not-a-uuid"],
    ] as const) {
      const res = await app.request(path, { method, ...as("admin-token") });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(revoked).toEqual([]);
  });
});

describe("user management", () => {
  it("lists users with emails", async () => {
    const { app } = setup();
    const list = (await (
      await app.request("/api/admin/users", as("admin-token"))
    ).json()) as unknown[];
    const users = list.map((u) => UserSummarySchema.parse(u));
    expect(users.map((u) => u.email).sort()).toEqual(["admin@example.com", "reader@example.com"]);
  });

  it("disables and re-enables, blocking the user immediately", async () => {
    const { app, admin } = setup();
    const post = (path: string) =>
      app.request(`/api/admin/users/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/${path}`, { method: "POST", ...as("admin-token") });
    expect((await post("disable")).status).toBe(204);
    expect(admin.accounts.get("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")?.banned).toBe(true);
    expect((await app.request("/api/books", as("user-token"))).status).toBe(403);
    expect((await post("enable")).status).toBe(204);
    expect((await app.request("/api/books", as("user-token"))).status).toBe(200);
  });

  it("refuses self-disable and self-delete", async () => {
    const { app } = setup();
    const self = await app.request("/api/admin/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/disable", {
      method: "POST",
      ...as("admin-token"),
    });
    expect(self.status).toBe(409);
    const del = await app.request("/api/admin/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      method: "DELETE",
      ...as("admin-token"),
    });
    expect(del.status).toBe(409);
  });

  it("returns a recovery link", async () => {
    const { app } = setup();
    const res = await app.request("/api/admin/users/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/reset-link", {
      method: "POST",
      ...as("admin-token"),
    });
    expect(((await res.json()) as { link: string }).link).toContain("reader%40example.com");
  });

  it("deletes a user", async () => {
    const { app, users, admin } = setup();
    const res = await app.request("/api/admin/users/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      method: "DELETE",
      ...as("admin-token"),
    });
    expect(res.status).toBe(204);
    expect(users.rows.has("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(false);
    expect(admin.accounts.has("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(false);
  });
});
