import type { WorkLease, WorkLeaseFactory, WorkLeaseRepository } from "@et/core";
import type { PostgresStoreFactory } from "@et/store-postgres";

export class PostgresWorkLeaseFactory implements WorkLeaseFactory {
  constructor(private readonly factory: PostgresStoreFactory) {}

  forOwner(ownerId: string): WorkLeaseRepository {
    const repo = this.factory.leasesForOwner(ownerId);
    return {
      async lease(jobId, chapterId, pendingSegmentIds, ttlMs) {
        const claimed = await repo.leaseAvailable(jobId, chapterId, pendingSegmentIds, ttlMs);
        return claimed ? { leaseId: claimed.id, segmentIds: claimed.segmentIds } : null;
      },
      async get(leaseId): Promise<WorkLease | null> {
        const row = await repo.get(leaseId);
        return row
          ? {
              leaseId: row.id,
              jobId: row.jobId,
              chapterId: row.chapterId,
              segmentIds: row.segmentIds,
              expiresAt: row.leasedUntil,
            }
          : null;
      },
      async release(leaseId) {
        await repo.release(leaseId);
      },
    };
  }
}
