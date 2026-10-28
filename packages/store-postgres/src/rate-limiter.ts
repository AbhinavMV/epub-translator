import type { Clock, RateLimiter } from "@et/core";
import type { Sql } from "./sql.ts";

const PRUNE_AFTER_MS = 24 * 3_600_000;

/** Server-only fixed-window counter shared by every serverless instance. */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly sql: Sql,
    private readonly clock: Clock,
    private readonly limit = 10,
    private readonly windowMs = 15 * 60_000,
  ) {}

  async allow(key: string): Promise<boolean> {
    const now = this.clock.now().getTime();
    const windowStart = new Date(Math.floor(now / this.windowMs) * this.windowMs).toISOString();
    const rows = await this.sql.query<{ count: number }>(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, $2::timestamptz, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [key, windowStart],
    );
    const count = Number(rows[0]?.count ?? 1);
    if (count === 1) {
      await this.sql.query("DELETE FROM rate_limits WHERE window_start < $1::timestamptz", [
        new Date(now - PRUNE_AFTER_MS).toISOString(),
      ]);
    }
    return count <= this.limit;
  }
}
