import { z } from "zod";
import { GlossaryEntrySchema, ProviderIdSchema } from "./api.ts";

export const TargetLanguageSchema = z.object({
  code: z.string(),
  name: z.string(),
  dir: z.enum(["ltr", "rtl"]),
  writingMode: z.enum(["horizontal-tb", "vertical-rl"]),
});

const ContextSchema = z.array(z.object({ source: z.string(), target: z.string() }));
const SegmentSourceSchema = z.object({ id: z.string(), text: z.string() });

const requestFields = {
  sourceLang: z.string().nullable(),
  target: TargetLanguageSchema,
  bookTitle: z.string(),
  context: ContextSchema,
  segments: z.array(SegmentSourceSchema),
  instructions: z.string().optional(),
  glossary: z.array(GlossaryEntrySchema).optional(),
};

export const WorkUnitSchema = z.object({
  leaseId: z.string(),
  jobId: z.string(),
  chapterId: z.string(),
  model: z.string().optional(),
  ...requestFields,
});
export type WorkUnitDto = z.infer<typeof WorkUnitSchema>;

export const BatchUnitSchema = z.object({ customId: z.string(), ...requestFields });
export const BatchPlanSchema = z.object({ units: z.array(BatchUnitSchema) });
export type BatchPlan = z.infer<typeof BatchPlanSchema>;

export const ResultSegmentSchema = z
  .object({
    id: z.string().min(1).max(512),
    text: z.string().max(200_000),
    status: z.enum(["done", "flagged", "failed"]),
    note: z.string().max(500).optional(),
  })
  .strict();
export type ResultSegment = z.infer<typeof ResultSegmentSchema>;

const nonNegativeInt = z.number().int().min(0).max(100_000_000);
const ClientUsageSchema = z
  .object({ inputTokens: nonNegativeInt, outputTokens: nonNegativeInt })
  .strict();

export const LeaseBodySchema = z.object({ after: z.string().max(512).optional() }).strict();
export type LeaseBody = z.infer<typeof LeaseBodySchema>;

export const WorkResultBodySchema = z
  .object({
    leaseId: z.string().min(1).max(128),
    segments: z.array(ResultSegmentSchema).max(500),
    usage: ClientUsageSchema,
  })
  .strict();
export type WorkResultBody = z.infer<typeof WorkResultBodySchema>;

export const RecordBatchBodySchema = z
  .object({
    chapterId: z.string().min(1).max(512),
    provider: ProviderIdSchema,
    model: z.string().min(1).max(200),
    vendorBatchId: z.string().min(1).max(512),
    segmentIds: z.array(z.array(z.string().min(1).max(512)).max(500)).max(500),
  })
  .strict();
export type RecordBatchBody = z.infer<typeof RecordBatchBodySchema>;

export const RecordedBatchSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  provider: ProviderIdSchema,
  model: z.string(),
  vendorBatchId: z.string(),
  segmentIds: z.array(z.array(z.string())),
  status: z.enum(["submitted", "ended", "failed", "cancelled"]),
  createdAt: z.string(),
});
export type RecordedBatch = z.infer<typeof RecordedBatchSchema>;

export const OpenBatchesSchema = z.array(RecordedBatchSchema);

export const BatchResultsBodySchema = z
  .object({
    segments: z.array(ResultSegmentSchema).max(5000),
    usage: ClientUsageSchema,
  })
  .strict();
export type BatchResultsBody = z.infer<typeof BatchResultsBodySchema>;

export const BatchStatusBodySchema = z
  .object({
    status: z.enum(["failed", "cancelled"]),
    error: z.string().max(500).optional(),
  })
  .strict();
export type BatchStatusBody = z.infer<typeof BatchStatusBodySchema>;

export const GlossarySampleQuerySchema = z.object({ targetLang: z.string().default("en") });

export const GlossarySampleSchema = z.object({
  sample: z.string(),
  sourceLang: z.string().nullable(),
  bookTitle: z.string(),
  existing: z.array(GlossaryEntrySchema),
  targetLang: z.string(),
});
export type GlossarySample = z.infer<typeof GlossarySampleSchema>;

export const PublicConfigSchema = z.object({
  authMode: z.enum(["none", "supabase"]),
  clientExecution: z.boolean(),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
