import { type AuthAdmin, acceptInvite, createInvite } from "@et/core";
import { PostgresStoreFactory, type Sql } from "@et/store-postgres";
import { ALICE, BOB, createTestDatabase } from "@et/store-postgres/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BytesLru } from "../src/infra/bytes-lru.ts";
import { NodeHasher } from "../src/infra/node-system.ts";
import { OwnerScopedBlobs } from "../src/infra/owner-keys.ts";
import {
  PostgresAppUserAdapter,
  PostgresInviteAdapter,
} from "../src/infra/postgres-auth-adapters.ts";
import { PostgresWorkLeaseFactory } from "../src/infra/postgres-lease-adapter.ts";
import { SupabaseBlobStore } from "../src/infra/supabase-blob-store.ts";
import { FakeStorage } from "./hosted-fakes.ts";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>["db"];

const key = (owner: string, sha = "a".repeat(64)) => `${owner}/books/${sha}.epub`;

describe("SupabaseBlobStore", () => {
  it("round-trips bytes and enforces an owner-scoped key", async () => {
    const storage = new FakeStorage();
    const store = new SupabaseBlobStore(storage);
    await store.put(key(ALICE), new Uint8Array([1, 2]));
    expect([...(await store.get(key(ALICE)))]).toEqual([1, 2]);
    for (const bad of [
      "books/x.epub",
      "../x",
      `${ALICE}/../${BOB}/books/x.epub`,
      `${ALICE}`,
      `${ALICE}//x`,
    ]) {
      await expect(store.put(bad, new Uint8Array())).rejects.toThrow(/invalid blob key/i);
      await expect(store.get(bad)).rejects.toThrow(/invalid blob key/i);
      await expect(store.delete(bad)).rejects.toThrow(/invalid blob key/i);
    }
  });

  it("serves repeat reads from the LRU without touching storage", async () => {
    const storage = new FakeStorage();
    storage.seed("books", key(ALICE), new Uint8Array([9]));
    const store = new SupabaseBlobStore(storage, 1024);
    await store.get(key(ALICE));
    await store.get(key(ALICE));
    await store.get(key(ALICE));
    expect(storage.downloads).toHaveLength(1);
  });

  it("evicts by byte budget, least recently used first", async () => {
    const storage = new FakeStorage();
    const store = new SupabaseBlobStore(storage, 10);
    const a = key(ALICE, "a".repeat(64));
    const b = key(ALICE, "b".repeat(64));
    const c = key(ALICE, "c".repeat(64));
    for (const k of [a, b, c]) storage.seed("books", k, new Uint8Array(4));
    await store.get(a);
    await store.get(b);
    await store.get(a);
    await store.get(c);
    storage.downloads.length = 0;
    await store.get(a);
    await store.get(c);
    expect(storage.downloads).toEqual([]);
    await store.get(b);
    expect(storage.downloads).toHaveLength(1);
  });

  it("keeps separate cache entries per owner and forgets deleted books", async () => {
    const storage = new FakeStorage();
    const store = new SupabaseBlobStore(storage);
    await store.put(key(ALICE), new Uint8Array([1]));
    await store.put(key(BOB), new Uint8Array([2]));
    expect([...(await store.get(key(BOB)))]).toEqual([2]);
    await store.delete(key(ALICE));
    await expect(store.get(key(ALICE))).rejects.toThrow();
  });

  it("never caches an object larger than the whole budget", () => {
    const lru = new BytesLru(4);
    lru.set("big", new Uint8Array(5));
    expect(lru.get("big")).toBeUndefined();
  });
});

describe("OwnerScopedBlobs", () => {
  it("prefixes every key with the owner and cannot reach another owner", async () => {
    const storage = new FakeStorage();
    const store = new SupabaseBlobStore(storage);
    const mine = new OwnerScopedBlobs(store, ALICE);
    const theirs = new OwnerScopedBlobs(store, BOB);
    await mine.put("books/x.epub", new Uint8Array([1]));
    expect([...storage.objects("books").keys()]).toEqual([`${ALICE}/books/x.epub`]);
    await expect(theirs.get("books/x.epub")).rejects.toThrow();
    await expect(mine.get(`../${BOB}/books/x.epub`)).rejects.toThrow(/invalid blob key/i);
    expect(() => new OwnerScopedBlobs(store, "not-a-uuid")).toThrow();
  });
});

describe("auth bridging on postgres", () => {
  let db: TestDb;
  let sql: Sql;
  let factory: PostgresStoreFactory;
  const now = new Date("2026-10-28T12:00:00.000Z");
  const clock = { now: () => now };
  const hasher = new NodeHasher();
  let invites: PostgresInviteAdapter;
  let users: PostgresAppUserAdapter;

  class Admin implements AuthAdmin {
    deleted: string[] = [];
    constructor(private readonly id: string) {}
    async createUser() {
      return { id: this.id };
    }
    async deleteUser(id: string) {
      this.deleted.push(id);
    }
    async banUser() {}
    async recoveryLink() {
      return "";
    }
    async listUsers() {
      return [];
    }
  }

  const random = { bytes: (n: number) => new Uint8Array(n).fill(7) };
  const allow = { allow: async () => true };

  beforeAll(async () => {
    ({ db, sql } = await createTestDatabase());
  });
  afterAll(() => db.close());
  beforeEach(async () => {
    await db.exec("truncate public.app_users, public.invites cascade");
    factory = new PostgresStoreFactory(sql);
    invites = new PostgresInviteAdapter(factory.invites);
    users = new PostgresAppUserAdapter(factory.appUsers);
  });

  const accept = (token: string, admin: AuthAdmin) =>
    acceptInvite(
      { invites, users, admin, hasher, clock, rateLimiter: allow, adminEmails: new Set() },
      { token, email: "New@Example.com", password: "p".repeat(12), clientKey: "k" },
    );

  it("maps create, list and revoke between the two shapes", async () => {
    const created = await invites.create({
      tokenHash: "h",
      email: "a@b.co",
      createdBy: ALICE,
      expiresAt: new Date(now.getTime() + 3_600_000),
    });
    expect(created.expiresAt).toBeInstanceOf(Date);
    expect(created.usedAt).toBeNull();
    expect(created.createdBy).toBe(ALICE);
    expect(await invites.list()).toHaveLength(1);
    await invites.revoke(created.id);
    expect(await invites.list()).toHaveLength(0);
  });

  it("accepts an invite, creates the app user and records who used it", async () => {
    const { token } = await createInvite(
      { invites, random, hasher, clock },
      { createdBy: ALICE, expiresInHours: 1 },
    );
    const created = await accept(token, new Admin(BOB));
    expect(created.id).toBe(BOB);
    expect(await users.get(BOB)).toEqual({ id: BOB, role: "user", disabled: false });
    const [row] = await factory.invites.list();
    expect(row?.usedBy).toBe(BOB);
    expect(row?.usedAt).not.toBeNull();
    await expect(accept(token, new Admin(BOB))).rejects.toThrow();
  });

  it("releases the invite and removes the auth user when the app user write fails", async () => {
    const { token } = await createInvite(
      { invites, random, hasher, clock },
      { createdBy: ALICE, expiresInHours: 1 },
    );
    const ghost = "99999999-9999-4999-8999-999999999999";
    const admin = new Admin(ghost);
    await expect(accept(token, admin)).rejects.toThrow();
    expect(admin.deleted).toEqual([ghost]);
    const [row] = await factory.invites.list();
    expect(row?.usedAt).toBeNull();
    expect(row?.usedBy).toBeNull();
    await expect(accept(token, new Admin(BOB))).resolves.toEqual({ id: BOB });
  });

  it("upserts, lists, disables and deletes app users", async () => {
    await users.upsert({ id: ALICE, role: "admin", disabled: false });
    await users.upsert({ id: BOB, role: "user", disabled: false });
    await users.setDisabled(BOB, true);
    expect(await users.list()).toEqual([
      { id: ALICE, role: "admin", disabled: false },
      { id: BOB, role: "user", disabled: true },
    ]);
    await users.delete(BOB);
    expect(await users.get(BOB)).toBeNull();
  });
});

describe("PostgresWorkLeaseFactory", () => {
  it("gives disjoint, owner-scoped leases with the core port's semantics", async () => {
    const { db, sql } = await createTestDatabase();
    const factory = new PostgresStoreFactory(sql);
    const { book, job, parsed } = await import("@et/store-postgres/fixtures");
    const repos = factory.forOwner(ALICE);
    await repos.books.insert(book, parsed);
    await repos.jobs.insert(job);
    const leases = new PostgresWorkLeaseFactory(factory).forOwner(ALICE);
    const first = await leases.lease(job.id, "ch-0", ["s0", "s1"], 60_000);
    const second = await leases.lease(job.id, "ch-0", ["s0", "s1", "s2"], 60_000);
    expect(first?.segmentIds).toEqual(["s0", "s1"]);
    expect(second?.segmentIds).toEqual(["s2"]);
    expect(await leases.lease(job.id, "ch-0", ["s0", "s1", "s2"], 60_000)).toBeNull();
    expect(await leases.get(first?.leaseId ?? "")).toMatchObject({
      jobId: job.id,
      chapterId: "ch-0",
      segmentIds: ["s0", "s1"],
    });
    await leases.release(first?.leaseId ?? "");
    expect(await leases.get(first?.leaseId ?? "")).toBeNull();
    expect((await leases.lease(job.id, "ch-0", ["s0"], 60_000))?.segmentIds).toEqual(["s0"]);
    const other = new PostgresWorkLeaseFactory(factory).forOwner(BOB);
    expect(await other.lease(job.id, "ch-0", ["s5"], 60_000)).toBeNull();
    await db.close();
  });
});
