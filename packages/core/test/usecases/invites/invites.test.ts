import { describe, expect, it } from "vitest";
import {
  AccountCreationError,
  acceptInvite,
  createInvite,
  InviteInvalidError,
  RateLimitedError,
} from "../../../src/index.ts";
import {
  allowAll,
  CountingRandom,
  FakeAuthAdmin,
  fakeHasher,
  LimitedAfter,
  MemoryAppUsers,
  MemoryInvites,
} from "./auth-fakes.ts";

const T0 = new Date("2026-10-28T00:00:00Z");

function setup(now = T0) {
  const clock = { now: () => now };
  const invites = new MemoryInvites(() => now);
  const users = new MemoryAppUsers();
  const admin = new FakeAuthAdmin();
  const random = new CountingRandom();
  const create = (input: { email?: string; expiresInHours?: number } = {}) =>
    createInvite(
      { invites, random, hasher: fakeHasher, clock },
      { createdBy: "admin-1", expiresInHours: 72, ...input },
    );
  const accept = (
    body: { token: string; email: string; password: string },
    deps: { rateLimiter?: LimitedAfter; adminEmails?: ReadonlySet<string> } = {},
    at = now,
  ) =>
    acceptInvite(
      {
        invites,
        users,
        admin,
        hasher: fakeHasher,
        clock: { now: () => at },
        rateLimiter: deps.rateLimiter ?? allowAll,
        adminEmails: deps.adminEmails ?? new Set(),
      },
      { ...body, clientKey: "1.2.3.4" },
    );
  return { invites, users, admin, create, accept };
}

describe("createInvite", () => {
  it("returns a base64url token of 32 random bytes", async () => {
    const { create } = setup();
    const { token } = await create();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never stores the token in plain", async () => {
    const { create, invites } = setup();
    const { token } = await create();
    const [row] = [...invites.rows.values()];
    expect(row?.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("sets expiry from the requested hours", async () => {
    const { create } = setup();
    const { invite } = await create({ expiresInHours: 2 });
    expect(invite.expiresAt.toISOString()).toBe("2026-10-28T02:00:00.000Z");
  });

  it("lowercases a bound email", async () => {
    const { create } = setup();
    const { invite } = await create({ email: "Reader@Example.COM" });
    expect(invite.email).toBe("reader@example.com");
  });
});

describe("acceptInvite admin emails", () => {
  it("refuses an ADMIN_EMAILS address, in any case, and keeps the invite unused", async () => {
    const { create, accept, admin, invites } = setup();
    const { token } = await create();
    const adminEmails = new Set(["boss@example.com"]);
    await expect(
      accept({ token, email: " Boss@Example.com ", password: "long-enough-pw" }, { adminEmails }),
    ).rejects.toThrow(InviteInvalidError);
    expect(admin.users.size).toBe(0);
    expect([...invites.rows.values()].every((i) => !i.usedAt)).toBe(true);
    await accept(
      { token, email: "reader@example.com", password: "long-enough-pw" },
      { adminEmails },
    );
  });
});

describe("acceptInvite", () => {
  const password = "correct horse battery";

  it("creates the account and an app_users row", async () => {
    const { create, accept, admin, users } = setup();
    const { token } = await create();
    const out = await accept({ token, email: "a@b.co", password });
    expect(out.id).toBe("user-1");
    expect(admin.users.get("user-1")?.email).toBe("a@b.co");
    expect(users.rows.get("user-1")).toEqual({ id: "user-1", role: "user", disabled: false });
  });

  it("is single use", async () => {
    const { create, accept } = setup();
    const { token } = await create();
    await accept({ token, email: "a@b.co", password });
    await expect(accept({ token, email: "c@d.co", password })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });

  it("rejects an expired invite", async () => {
    const { create, accept } = setup();
    const { token } = await create({ expiresInHours: 1 });
    const later = new Date(T0.getTime() + 2 * 3600_000);
    await expect(accept({ token, email: "a@b.co", password }, {}, later)).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });

  it("rejects an unknown token", async () => {
    const { accept } = setup();
    await expect(accept({ token: "nope", email: "a@b.co", password })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
  });

  it("enforces a bound email case-insensitively", async () => {
    const { create, accept } = setup();
    const { token } = await create({ email: "bound@x.io" });
    await expect(accept({ token, email: "other@x.io", password })).rejects.toBeInstanceOf(
      InviteInvalidError,
    );
    await expect(accept({ token, email: "BOUND@x.io", password })).resolves.toBeDefined();
  });

  it("records which user consumed the invite", async () => {
    const { create, accept, invites } = setup();
    const { token } = await create();
    const created = await accept({ token, email: "a@b.co", password });
    expect([...invites.usedBy.values()]).toEqual([created.id]);
  });

  it("releases the invite when createUser fails", async () => {
    const { create, accept, admin, invites } = setup();
    const { token } = await create();
    admin.failCreate = true;
    await expect(accept({ token, email: "a@b.co", password })).rejects.toBeInstanceOf(
      AccountCreationError,
    );
    expect([...invites.rows.values()][0]?.usedAt).toBeNull();
    admin.failCreate = false;
    await expect(accept({ token, email: "a@b.co", password })).resolves.toBeDefined();
  });

  it("removes the auth user and releases the invite when the app_users write fails", async () => {
    const { create, accept, admin, users, invites } = setup();
    const { token } = await create();
    users.failUpsert = true;
    await expect(accept({ token, email: "a@b.co", password })).rejects.toBeInstanceOf(
      AccountCreationError,
    );
    expect(admin.users.size).toBe(0);
    expect([...invites.rows.values()][0]?.usedAt).toBeNull();
  });

  it("stops at the rate limiter before touching the invite", async () => {
    const { create, accept, invites } = setup();
    const { token } = await create();
    const limiter = new LimitedAfter(0);
    await expect(
      accept({ token, email: "a@b.co", password }, { rateLimiter: limiter }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(limiter.calls).toEqual(["invite-accept:1.2.3.4"]);
    expect([...invites.rows.values()][0]?.usedAt).toBeNull();
  });
});
