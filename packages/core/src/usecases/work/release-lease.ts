import type { WorkLeaseRepository } from "../../ports/work-lease.ts";

export async function releaseWorkLease(
  leases: WorkLeaseRepository,
  jobId: string,
  leaseId: string,
): Promise<void> {
  const lease = await leases.get(leaseId);
  if (lease && lease.jobId === jobId) await leases.release(leaseId);
}
