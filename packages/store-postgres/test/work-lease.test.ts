import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql } from "../src/index.ts";
import { book, job, parsed } from "./fixtures.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;
let clock: Date;
let n: number;

const TTL = 10 * 60_000;
const batches = [["s0", "s1"], ["s2", "s3"], ["s4"]];

function leases(ownerId = ALICE) {
  return new PostgresStoreFactory(sql, {
    now: () => clock,
    newId: () => `lease-${++n}`,
  }).leasesForOwner(ownerId);
}

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await resetData(db);
  clock = new Date("2026-10-28T12:00:00.000Z");
  n = 0;
  const repos = new PostgresStoreFactory(sql).forOwner(ALICE);
  await repos.books.insert(book, parsed);
  await repos.jobs.insert(job);
});

describe("PostgresWorkLeaseRepository", () => {
  it("returns disjoint batches to concurrent callers", async () => {
    const repo = leases();
    const got = await Promise.all(
      Array.from({ length: 5 }, () => repo.leaseNext("j1", "ch-0", batches, TTL)),
    );
    const segmentIds = got.filter((l) => l !== null).flatMap((l) => l.segmentIds);
    expect(got.filter((l) => l !== null)).toHaveLength(3);
    expect(got.filter((l) => l === null)).toHaveLength(2);
    expect(new Set(segmentIds).size).toBe(segmentIds.length);
    expect([...segmentIds].sort()).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });

  it("stamps the lease expiry from the ttl", async () => {
    const lease = await leases().leaseNext("j1", "ch-0", batches, TTL);
    expect(lease).toMatchObject({
      id: "lease-1",
      segmentIds: ["s0", "s1"],
      leasedUntil: "2026-10-28T12:10:00.000Z",
    });
  });

  it("re-issues a batch after its lease expires", async () => {
    const repo = leases();
    const first = await repo.leaseNext("j1", "ch-0", [["s0"]], TTL);
    expect(await repo.leaseNext("j1", "ch-0", [["s0"]], TTL)).toBeNull();
    clock = new Date(clock.getTime() + TTL);
    const again = await repo.leaseNext("j1", "ch-0", [["s0"]], TTL);
    expect(again?.segmentIds).toEqual(["s0"]);
    expect(again?.id).not.toBe(first?.id);
    expect(await repo.get(first?.id ?? "")).toBeNull();
  });

  it("re-offers a released batch immediately", async () => {
    const repo = leases();
    const first = await repo.leaseNext("j1", "ch-0", [["s0"]], TTL);
    expect(await repo.release(first?.id ?? "")).toBe(true);
    expect(await repo.release(first?.id ?? "")).toBe(false);
    expect(await repo.leaseNext("j1", "ch-0", [["s0"]], TTL)).not.toBeNull();
  });

  it("skips candidates that overlap a live lease", async () => {
    const repo = leases();
    await repo.leaseNext("j1", "ch-0", [["s0", "s1"]], TTL);
    const next = await repo.leaseNext("j1", "ch-0", [["s1", "s2"], ["s3"]], TTL);
    expect(next?.segmentIds).toEqual(["s3"]);
  });

  it("keeps chapters independent", async () => {
    const repo = leases();
    await repo.leaseNext("j1", "ch-0", [["s0"]], TTL);
    expect(await repo.leaseNext("j1", "ch-1", [["s0"]], TTL)).not.toBeNull();
  });

  it("gives nothing for an unknown job or another owner's job", async () => {
    expect(await leases().leaseNext("nope", "ch-0", batches, TTL)).toBeNull();
    expect(await leases(BOB).leaseNext("j1", "ch-0", batches, TTL)).toBeNull();
  });

  it("does not let another owner read or release a lease", async () => {
    const lease = await leases().leaseNext("j1", "ch-0", batches, TTL);
    expect(await leases(BOB).get(lease?.id ?? "")).toBeNull();
    expect(await leases(BOB).release(lease?.id ?? "")).toBe(false);
    expect(await leases().get(lease?.id ?? "")).not.toBeNull();
  });

  it("drops leases when the job is deleted", async () => {
    await leases().leaseNext("j1", "ch-0", batches, TTL);
    await db.query("delete from jobs where id = 'j1'");
    const [row] = await sql.query<{ n: number }>("select count(*)::int as n from work_leases");
    expect(row?.n).toBe(0);
  });
});
