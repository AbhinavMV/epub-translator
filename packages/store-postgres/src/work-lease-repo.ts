import { randomUUID } from "node:crypto";
import { iso, json } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

export interface WorkLease {
  id: string;
  jobId: string;
  chapterId: string;
  segmentIds: string[];
  leasedUntil: string;
}

export interface WorkLeaseOptions {
  now?: () => Date;
  newId?: () => string;
}

interface LeaseRow {
  id: string;
  job_id: string;
  chapter_id: string;
  segment_ids: unknown;
  leased_until: Date | string;
}

function toLease(row: LeaseRow): WorkLease {
  return {
    id: row.id,
    jobId: row.job_id,
    chapterId: row.chapter_id,
    segmentIds: json<string[]>(row.segment_ids),
    leasedUntil: iso(row.leased_until),
  };
}

export class PostgresWorkLeaseRepository {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
    options: WorkLeaseOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomUUID;
  }

  /**
   * Hands out the first candidate batch whose segments are not covered by a live lease.
   * The job row lock serialises concurrent callers, so their batches are disjoint.
   */
  async leaseNext(
    jobId: string,
    chapterId: string,
    candidates: readonly (readonly string[])[],
    ttlMs: number,
  ): Promise<WorkLease | null> {
    return this.claim(jobId, chapterId, ttlMs, (taken) =>
      candidates.find((ids) => ids.length > 0 && ids.every((id) => !taken.has(id))),
    );
  }

  /** Claims those of `ids` that no live lease on the chapter holds; null when none is free. */
  async leaseAvailable(
    jobId: string,
    chapterId: string,
    ids: readonly string[],
    ttlMs: number,
  ): Promise<WorkLease | null> {
    return this.claim(jobId, chapterId, ttlMs, (taken) => {
      const free = [...new Set(ids)].filter((id) => !taken.has(id));
      return free.length > 0 ? free : undefined;
    });
  }

  private async claim(
    jobId: string,
    chapterId: string,
    ttlMs: number,
    pick: (taken: ReadonlySet<string>) => readonly string[] | undefined,
  ): Promise<WorkLease | null> {
    const now = this.now();
    const leasedUntil = new Date(now.getTime() + ttlMs);
    return withOwner(this.sql, this.ownerId, async (tx) => {
      const locked = await tx.query(
        "SELECT id FROM jobs WHERE owner_id = $1 AND id = $2 FOR UPDATE",
        [this.ownerId, jobId],
      );
      if (locked.length === 0) return null;
      await tx.query(
        `DELETE FROM work_leases
         WHERE owner_id = $1 AND job_id = $2 AND chapter_id = $3 AND leased_until <= $4::timestamptz`,
        [this.ownerId, jobId, chapterId, now.toISOString()],
      );
      const live = await tx.query<{ segment_id: string }>(
        `SELECT jsonb_array_elements_text(segment_ids) AS segment_id FROM work_leases
         WHERE owner_id = $1 AND job_id = $2 AND chapter_id = $3`,
        [this.ownerId, jobId, chapterId],
      );
      const taken = new Set(live.map((r) => r.segment_id));
      const batch = pick(taken);
      if (!batch) return null;
      const id = this.newId();
      await tx.query(
        `INSERT INTO work_leases (owner_id, id, job_id, chapter_id, segment_ids, leased_until)
         VALUES ($1, $2, $3, $4, $5::text::jsonb, $6::timestamptz)`,
        [this.ownerId, id, jobId, chapterId, JSON.stringify(batch), leasedUntil.toISOString()],
      );
      return {
        id,
        jobId,
        chapterId,
        segmentIds: [...batch],
        leasedUntil: leasedUntil.toISOString(),
      };
    });
  }

  async get(leaseId: string): Promise<WorkLease | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<LeaseRow>(
        `SELECT id, job_id, chapter_id, segment_ids, leased_until FROM work_leases
         WHERE owner_id = $1 AND id = $2 AND leased_until > $3::timestamptz`,
        [this.ownerId, leaseId, this.now().toISOString()],
      ),
    );
    return rows[0] ? toLease(rows[0]) : null;
  }

  async release(leaseId: string): Promise<boolean> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("DELETE FROM work_leases WHERE owner_id = $1 AND id = $2 RETURNING id", [
        this.ownerId,
        leaseId,
      ]),
    );
    return rows.length > 0;
  }
}
