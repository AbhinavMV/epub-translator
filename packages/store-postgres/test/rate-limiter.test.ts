import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresRateLimiter, type Sql } from "../src/index.ts";
import { createTestDatabase } from "./harness.ts";

let db: PGlite;
let sql: Sql;
let nowMs = Date.parse("2026-10-28T12:00:00.000Z");
const clock = { now: () => new Date(nowMs) };

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("truncate public.rate_limits");
});

describe("PostgresRateLimiter", () => {
  it("allows up to the limit within a window, per key", async () => {
    const limiter = new PostgresRateLimiter(sql, clock, 3, 60_000);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await limiter.allow("a"));
    expect(results).toEqual([true, true, true, false, false]);
    expect(await limiter.allow("b")).toBe(true);
  });

  it("starts a fresh window and prunes day-old rows", async () => {
    const limiter = new PostgresRateLimiter(sql, clock, 1, 60_000);
    expect(await limiter.allow("a")).toBe(true);
    expect(await limiter.allow("a")).toBe(false);
    nowMs += 61_000;
    expect(await limiter.allow("a")).toBe(true);
    nowMs += 25 * 3_600_000;
    expect(await limiter.allow("c")).toBe(true);
    const rows = await sql.query("select key from rate_limits");
    expect(rows).toEqual([{ key: "c" }]);
  });

  it("counts concurrent attempts atomically", async () => {
    const limiter = new PostgresRateLimiter(sql, clock, 2, 60_000);
    const results = await Promise.all(Array.from({ length: 6 }, () => limiter.allow("x")));
    expect(results.filter(Boolean)).toHaveLength(2);
  });
});
