import {
  BatchResultsBodySchema,
  BatchStatusBodySchema,
  GlossarySampleQuerySchema,
  RecordBatchBodySchema,
  type ResultSegment,
  WorkResultBodySchema,
} from "@et/contracts";
import {
  applyBatchResult,
  applyWorkResult,
  buildSample,
  DEFAULT_SAMPLE_CHARS,
  endClientBatch,
  type ProviderBatch,
  planBatchUnits,
  planWorkUnit,
  recordClientBatch,
  requireBook,
  type SegmentTranslation,
} from "@et/core";
import { Hono } from "hono";
import type { Services } from "../services.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

export const WORK_LIMITS = { maxChars: 4000, maxCount: 40, contextSize: 8 };

function toResults(segments: readonly ResultSegment[]): Map<string, SegmentTranslation> {
  const results = new Map<string, SegmentTranslation>();
  for (const s of segments) {
    results.set(s.id, { text: s.text, status: s.status, ...(s.note ? { note: s.note } : {}) });
  }
  return results;
}

function presentBatch(b: ProviderBatch) {
  return {
    id: b.id,
    chapterId: b.chapterId,
    provider: b.provider,
    model: b.model,
    vendorBatchId: b.vendorBatchId,
    status: b.status,
    createdAt: b.createdAt,
  };
}

export function workRoutes(s: Services) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.header("cache-control", "no-store");
      await next();
    })
    .post("/:id/chapters/:chapterId/lease", async (c) => {
      const unit = await planWorkUnit(c.var.repos, s.leases.forOwner(c.var.ownerId), {
        jobId: c.req.param("id"),
        chapterId: c.req.param("chapterId"),
        ...WORK_LIMITS,
      });
      return unit ? c.json(unit) : c.body(null, 204);
    })
    .post("/:id/results", validate("json", WorkResultBodySchema), async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await applyWorkResult(c.var.repos, s.leases.forOwner(c.var.ownerId), {
          jobId: c.req.param("id"),
          leaseId: body.leaseId,
          results: toResults(body.segments),
          usage: body.usage,
          events: s.events,
        }),
      );
    })
    .post("/:id/chapters/:chapterId/batch-plan", async (c) => {
      const units = await planBatchUnits(c.var.repos, {
        jobId: c.req.param("id"),
        chapterId: c.req.param("chapterId"),
        ...WORK_LIMITS,
      });
      return c.json({ units });
    })
    .get("/:id/batches", async (c) => {
      const open = await c.var.repos.batches.openForJob(c.req.param("id"));
      return c.json(open.map(presentBatch));
    })
    .post("/:id/batches", validate("json", RecordBatchBodySchema), async (c) => {
      const body = c.req.valid("json");
      const batch = await recordClientBatch(
        c.var.repos,
        { ids: s.ids, clock: s.clock, events: s.events },
        { ...body, jobId: c.req.param("id") },
      );
      return c.json(presentBatch(batch), 201);
    })
    .post("/:id/batches/:batchId/results", validate("json", BatchResultsBodySchema), async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await applyBatchResult(c.var.repos, {
          jobId: c.req.param("id"),
          batchId: c.req.param("batchId"),
          results: toResults(body.segments),
          usage: body.usage,
          events: s.events,
        }),
      );
    })
    .patch("/:id/batches/:batchId", validate("json", BatchStatusBodySchema), async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await endClientBatch(c.var.repos, {
          jobId: c.req.param("id"),
          batchId: c.req.param("batchId"),
          status: body.status,
          ...(body.error ? { error: body.error } : {}),
          events: s.events,
        }),
      );
    });
}

export function glossarySampleRoutes() {
  return new Hono<AppEnv>().get(
    "/:id/glossary/sample",
    validate("query", GlossarySampleQuerySchema),
    async (c) => {
      const bookId = c.req.param("id");
      const { book, parsed } = await requireBook(c.var.repos.books, bookId);
      c.header("cache-control", "no-store");
      return c.json({
        sample: buildSample(parsed, DEFAULT_SAMPLE_CHARS),
        sourceLang: parsed.sourceLang ?? book.sourceLang,
        bookTitle: book.title,
        existing: (await c.var.repos.settings.get(bookId)).glossary,
        targetLang: c.req.valid("query").targetLang,
      });
    },
  );
}
