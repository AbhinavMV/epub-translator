export interface WorkLease {
  leaseId: string;
  jobId: string;
  chapterId: string;
  segmentIds: string[];
  expiresAt: string;
}

export interface WorkLeaseRepository {
  /**
   * Claims those of `pendingSegmentIds` that no live lease on the same job holds.
   * Returns null when none could be claimed. Expired leases never block a claim.
   */
  lease(
    jobId: string,
    chapterId: string,
    pendingSegmentIds: readonly string[],
    ttlMs: number,
  ): Promise<{ leaseId: string; segmentIds: string[] } | null>;
  get(leaseId: string): Promise<WorkLease | null>;
  release(leaseId: string): Promise<void>;
}

export interface WorkLeaseFactory {
  forOwner(ownerId: string): WorkLeaseRepository;
}
