import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresAppUserRepository, PostgresInviteRepository, type Sql } from "../src/index.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;
let invites: PostgresInviteRepository;

const now = new Date("2026-10-28T12:00:00.000Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await resetData(db);
  invites = new PostgresInviteRepository(sql);
});

describe("PostgresInviteRepository", () => {
  it("creates, lists and revokes pending invites", async () => {
    const a = await invites.create({
      tokenHash: "h1",
      email: "Reader@Example.com",
      createdBy: ALICE,
      expiresAt: inHours(72),
    });
    await invites.create({ tokenHash: "h2", email: null, createdBy: null, expiresAt: inHours(1) });
    expect(a).toMatchObject({ email: "reader@example.com", usedAt: null, expiresAt: inHours(72) });
    expect(await invites.list()).toHaveLength(2);
    expect(await invites.revoke(a.id)).toBe(true);
    expect(await invites.revoke(a.id)).toBe(false);
    expect((await invites.list()).map((i) => i.tokenHash)).toEqual(["h2"]);
  });

  it("accepts an invite once", async () => {
    await invites.create({ tokenHash: "h1", email: null, createdBy: null, expiresAt: inHours(1) });
    const first = await invites.accept("h1", "a@example.com", now);
    expect(first).toMatchObject({ tokenHash: "h1", usedAt: now.toISOString() });
    expect(await invites.accept("h1", "a@example.com", now)).toBeNull();
  });

  it("lets only one of many concurrent accepts win", async () => {
    await invites.create({ tokenHash: "h1", email: null, createdBy: null, expiresAt: inHours(1) });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => invites.accept("h1", "a@example.com", now)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("refuses an expired invite", async () => {
    await invites.create({ tokenHash: "h1", email: null, createdBy: null, expiresAt: inHours(1) });
    expect(await invites.accept("h1", "a@example.com", new Date(inHours(2)))).toBeNull();
    expect(await invites.accept("h1", "a@example.com", now)).not.toBeNull();
  });

  it("refuses an unknown token and a different email than the bound one", async () => {
    await invites.create({
      tokenHash: "h1",
      email: "a@example.com",
      createdBy: null,
      expiresAt: inHours(1),
    });
    expect(await invites.accept("nope", "a@example.com", now)).toBeNull();
    expect(await invites.accept("h1", "b@example.com", now)).toBeNull();
    expect(await invites.accept("h1", "A@Example.com", now)).not.toBeNull();
  });

  it("can roll back an accept so the invite is usable again", async () => {
    await invites.create({ tokenHash: "h1", email: null, createdBy: null, expiresAt: inHours(1) });
    const accepted = await invites.accept("h1", "a@example.com", now);
    await invites.rollbackAccept(accepted?.id ?? "");
    expect(await invites.accept("h1", "a@example.com", now)).not.toBeNull();
  });

  it("records who used the invite", async () => {
    await invites.create({ tokenHash: "h1", email: null, createdBy: null, expiresAt: inHours(1) });
    const accepted = await invites.accept("h1", "a@example.com", now);
    await invites.markUsedBy(accepted?.id ?? "", BOB);
    expect((await invites.list())[0]).toMatchObject({ usedBy: BOB });
  });
});

describe("PostgresAppUserRepository", () => {
  it("upserts, reads and updates app users", async () => {
    const users = new PostgresAppUserRepository(sql);
    expect(await users.get(ALICE)).toBeNull();
    const created = await users.upsert({ id: ALICE, role: "user" });
    expect(created).toMatchObject({ id: ALICE, role: "user", disabled: false });
    await users.upsert({ id: ALICE, role: "admin" });
    await users.setDisabled(ALICE, true);
    expect(await users.get(ALICE)).toMatchObject({ role: "admin", disabled: true });
    await users.setRole(ALICE, "user");
    await users.setDisabled(ALICE, false);
    expect(await users.get(ALICE)).toMatchObject({ role: "user", disabled: false });
    await users.upsert({ id: BOB, role: "user" });
    expect((await users.list()).map((u) => u.id)).toEqual([ALICE, BOB]);
  });

  it("rejects an unknown role", async () => {
    const users = new PostgresAppUserRepository(sql);
    await expect(users.upsert({ id: ALICE, role: "root" as "admin" })).rejects.toThrow();
  });
});
