import type {
  BatchPlan,
  ChapterProgress,
  RecordBatchBody,
  RecordedBatch,
  WorkResultBody,
  WorkUnitDto,
} from "@et/contracts";
import { getTargetLanguage } from "@et/contracts";
import { ApiRequestError } from "@/api/client";
import type { WorkApi } from "@/translate/work-api";

export interface FakeBook {
  chapterId: string;
  segments: { id: string; text: string }[];
}

export class FakeWorkApi implements WorkApi {
  readonly results = new Map<string, { text: string; status: string; note?: string }>();
  readonly posted: WorkResultBody[] = [];
  readonly leaseCalls: (string | undefined)[] = [];
  readonly batches: RecordedBatch[] = [];
  readonly ended: { id: string; status: string; error?: string }[] = [];
  readonly batchPosts: { id: string; segments: WorkResultBody["segments"] }[] = [];
  usage = { inputTokens: 0, outputTokens: 0 };
  failPostsWith: ApiRequestError[] = [];
  private held = new Set<string>();
  private leases = new Map<string, string[]>();
  private n = 0;

  constructor(
    readonly book: FakeBook,
    private readonly perLease = 2,
  ) {}

  async getConfig() {
    return { authMode: "supabase" as const, clientExecution: true };
  }

  async lease(_jobId: string, _chapterId: string, after?: string): Promise<WorkUnitDto | null> {
    this.leaseCalls.push(after);
    const start = after ? this.book.segments.findIndex((s) => s.id === after) + 1 : 0;
    const pending = this.book.segments
      .slice(start)
      .filter((s) => !this.held.has(s.id) && this.results.get(s.id)?.status !== "done")
      .slice(0, this.perLease);
    if (pending.length === 0) return null;
    const leaseId = `lease-${++this.n}`;
    for (const s of pending) this.held.add(s.id);
    this.leases.set(
      leaseId,
      pending.map((s) => s.id),
    );
    return {
      leaseId,
      jobId: "j1",
      chapterId: this.book.chapterId,
      sourceLang: "ja",
      target: getTargetLanguage("en"),
      bookTitle: "B",
      context: [],
      segments: pending,
    };
  }

  progress(): ChapterProgress {
    const all = this.book.segments.map((s) => this.results.get(s.id)?.status);
    const done = all.filter((s) => s === "done").length;
    const flagged = all.filter((s) => s === "flagged").length;
    const failed = all.filter((s) => s === "failed").length;
    return {
      chapterId: this.book.chapterId,
      status: done + flagged === all.length ? "done" : "partial",
      done,
      flagged,
      failed,
      total: all.length,
      error: null,
    };
  }

  async postResults(_jobId: string, body: WorkResultBody): Promise<ChapterProgress> {
    const fail = this.failPostsWith.shift();
    if (fail) throw fail;
    const ids = this.leases.get(body.leaseId);
    if (!ids) throw new ApiRequestError("Lease expired or unknown", 409);
    this.leases.delete(body.leaseId);
    for (const id of ids) this.held.delete(id);
    this.posted.push(body);
    this.usage.inputTokens += body.usage.inputTokens;
    this.usage.outputTokens += body.usage.outputTokens;
    for (const s of body.segments) {
      this.results.set(s.id, {
        text: s.text,
        status: s.status,
        ...(s.note ? { note: s.note } : {}),
      });
    }
    return this.progress();
  }

  plan: BatchPlan = { units: [] };
  async batchPlan(): Promise<BatchPlan> {
    return this.plan;
  }

  async listBatches(): Promise<RecordedBatch[]> {
    return this.batches.filter((b) => b.status === "submitted");
  }

  async recordBatch(_jobId: string, body: RecordBatchBody): Promise<RecordedBatch> {
    const batch: RecordedBatch = {
      id: `batch-${this.batches.length + 1}`,
      chapterId: body.chapterId,
      provider: body.provider,
      model: body.model,
      vendorBatchId: body.vendorBatchId,
      segmentIds: body.segmentIds,
      status: "submitted",
      createdAt: "t",
    };
    this.batches.push(batch);
    return batch;
  }

  async postBatchResults(
    _jobId: string,
    batchId: string,
    body: { segments: WorkResultBody["segments"] },
  ) {
    this.batchPosts.push({ id: batchId, segments: body.segments });
    const batch = this.batches.find((b) => b.id === batchId);
    if (batch) batch.status = "ended";
    return this.progress();
  }

  async endBatch(_jobId: string, batchId: string, body: { status: string; error?: string }) {
    this.ended.push({
      id: batchId,
      status: body.status,
      ...(body.error ? { error: body.error } : {}),
    });
    const batch = this.batches.find((b) => b.id === batchId);
    if (batch) batch.status = body.status as RecordedBatch["status"];
    return this.progress();
  }

  async glossarySample() {
    return {
      sample: "sample text",
      sourceLang: "ja",
      bookTitle: "B",
      existing: [],
      targetLang: "en",
    };
  }
}
