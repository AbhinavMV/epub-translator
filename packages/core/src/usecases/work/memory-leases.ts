import type { Clock, IdGenerator } from "../../ports/system.ts";
import type { WorkLease, WorkLeaseFactory, WorkLeaseRepository } from "../../ports/work-lease.ts";

export class MemoryWorkLeases implements WorkLeaseRepository {
  private readonly rows = new Map<string, WorkLease>();

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async lease(
    jobId: string,
    chapterId: string,
    pendingSegmentIds: readonly string[],
    ttlMs: number,
  ): Promise<{ leaseId: string; segmentIds: string[] } | null> {
    const now = this.clock.now().getTime();
    const held = new Set<string>();
    for (const [id, row] of this.rows) {
      if (Date.parse(row.expiresAt) <= now) this.rows.delete(id);
      else if (row.jobId === jobId) for (const s of row.segmentIds) held.add(s);
    }
    const segmentIds = pendingSegmentIds.filter((id) => !held.has(id));
    if (segmentIds.length === 0) return null;
    const leaseId = this.ids.next();
    this.rows.set(leaseId, {
      leaseId,
      jobId,
      chapterId,
      segmentIds,
      expiresAt: new Date(now + ttlMs).toISOString(),
    });
    return { leaseId, segmentIds };
  }

  async get(leaseId: string): Promise<WorkLease | null> {
    return this.rows.get(leaseId) ?? null;
  }

  async release(leaseId: string): Promise<void> {
    this.rows.delete(leaseId);
  }
}

export class MemoryWorkLeaseFactory implements WorkLeaseFactory {
  private readonly owners = new Map<string, MemoryWorkLeases>();

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  forOwner(ownerId: string): MemoryWorkLeases {
    let leases = this.owners.get(ownerId);
    if (!leases) {
      leases = new MemoryWorkLeases(this.clock, this.ids);
      this.owners.set(ownerId, leases);
    }
    return leases;
  }
}
