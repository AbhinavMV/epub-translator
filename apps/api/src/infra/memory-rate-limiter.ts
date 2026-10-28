import type { Clock, RateLimiter } from "@et/core";

export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly limit = 10,
    private readonly windowMs = 15 * 60_000,
  ) {}

  async allow(key: string): Promise<boolean> {
    const now = this.clock.now().getTime();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
