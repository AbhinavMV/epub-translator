import {
  ApiErrorSchema,
  type BatchPlan,
  BatchPlanSchema,
  type BatchResultsBody,
  type BatchStatusBody,
  type ChapterProgress,
  ChapterProgressSchema,
  type GlossarySample,
  GlossarySampleSchema,
  OpenBatchesSchema,
  type PublicConfig,
  PublicConfigSchema,
  type RecordBatchBody,
  type RecordedBatch,
  RecordedBatchSchema,
  type WorkResultBody,
  type WorkUnitDto,
  WorkUnitSchema,
} from "@et/contracts";
import { ApiRequestError } from "@/api/client";

export interface WorkApi {
  getConfig(): Promise<PublicConfig>;
  lease(jobId: string, chapterId: string, after?: string): Promise<WorkUnitDto | null>;
  postResults(jobId: string, body: WorkResultBody): Promise<ChapterProgress>;
  deleteLease(jobId: string, leaseId: string): Promise<void>;
  batchPlan(jobId: string, chapterId: string, offset?: number): Promise<BatchPlan>;
  listBatches(jobId: string): Promise<RecordedBatch[]>;
  recordBatch(jobId: string, body: RecordBatchBody): Promise<RecordedBatch>;
  postBatchResults(
    jobId: string,
    batchId: string,
    body: BatchResultsBody,
  ): Promise<ChapterProgress>;
  endBatch(jobId: string, batchId: string, body: BatchStatusBody): Promise<ChapterProgress>;
  glossarySample(bookId: string, targetLang: string): Promise<GlossarySample>;
}

const enc = encodeURIComponent;

export function createWorkApi(fetchFn: typeof fetch = (...args) => fetch(...args)): WorkApi {
  async function raw(path: string, method: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(`/api${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiRequestError("Cannot reach the API server", 0);
    }
    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
      throw new ApiRequestError(
        parsed.success ? parsed.data.error : `Request failed (${res.status})`,
        res.status,
      );
    }
    return res;
  }

  const json = async <T>(
    schema: { parse(v: unknown): T },
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T> => schema.parse(await (await raw(path, method, body)).json());

  return {
    getConfig: () => json(PublicConfigSchema, "/config", "GET"),
    async lease(jobId, chapterId, after) {
      const res = await raw(
        `/jobs/${enc(jobId)}/chapters/${enc(chapterId)}/lease`,
        "POST",
        after ? { after } : {},
      );
      return res.status === 204 ? null : WorkUnitSchema.parse(await res.json());
    },
    postResults: (jobId, body) =>
      json(ChapterProgressSchema, `/jobs/${enc(jobId)}/results`, "POST", body),
    async deleteLease(jobId, leaseId) {
      await raw(`/jobs/${enc(jobId)}/leases/${enc(leaseId)}`, "DELETE");
    },
    batchPlan: (jobId, chapterId, offset = 0) =>
      json(
        BatchPlanSchema,
        `/jobs/${enc(jobId)}/chapters/${enc(chapterId)}/batch-plan?offset=${offset}`,
        "POST",
      ),
    listBatches: (jobId) => json(OpenBatchesSchema, `/jobs/${enc(jobId)}/batches`, "GET"),
    recordBatch: (jobId, body) =>
      json(RecordedBatchSchema, `/jobs/${enc(jobId)}/batches`, "POST", body),
    postBatchResults: (jobId, batchId, body) =>
      json(
        ChapterProgressSchema,
        `/jobs/${enc(jobId)}/batches/${enc(batchId)}/results`,
        "POST",
        body,
      ),
    endBatch: (jobId, batchId, body) =>
      json(ChapterProgressSchema, `/jobs/${enc(jobId)}/batches/${enc(batchId)}`, "PATCH", body),
    glossarySample: (bookId, targetLang) =>
      json(
        GlossarySampleSchema,
        `/books/${enc(bookId)}/glossary/sample?targetLang=${enc(targetLang)}`,
        "GET",
      ),
  };
}
