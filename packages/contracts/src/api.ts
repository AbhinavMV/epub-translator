import { z } from "zod";

export const CONTENTS_CHAPTER_ID = "ch-contents";

export const ProviderIdSchema = z.enum(["anthropic", "openai", "gemini", "fake"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const SegmentStatusSchema = z.enum(["pending", "done", "flagged", "failed"]);
export type SegmentStatus = z.infer<typeof SegmentStatusSchema>;

export const ChapterStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "submitted",
  "done",
  "partial",
  "failed",
]);
export type ChapterStatus = z.infer<typeof ChapterStatusSchema>;

export const JobStatusSchema = z.enum(["idle", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const UsageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number() });
export type Usage = z.infer<typeof UsageSchema>;

export const ChapterSummarySchema = z.object({
  id: z.string(),
  index: z.number(),
  title: z.string(),
  segmentCount: z.number(),
  charCount: z.number(),
});
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;

export const ChapterProgressSchema = z.object({
  chapterId: z.string(),
  status: ChapterStatusSchema,
  done: z.number(),
  flagged: z.number(),
  failed: z.number(),
  total: z.number(),
  error: z.string().nullable(),
});
export type ChapterProgress = z.infer<typeof ChapterProgressSchema>;

export const JobTitlesSchema = z.object({
  book: z.string().nullable(),
  chapters: z.record(z.string(), z.string()),
});
export type JobTitles = z.infer<typeof JobTitlesSchema>;

export const JobSummarySchema = z.object({
  id: z.string(),
  bookId: z.string(),
  targetLang: z.string(),
  status: JobStatusSchema,
  error: z.string().nullable(),
  progress: z.array(ChapterProgressSchema),
  titles: JobTitlesSchema,
  usage: UsageSchema,
  createdAt: z.string(),
});
export type JobSummary = z.infer<typeof JobSummarySchema>;

export const BookSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  sourceLang: z.string().nullable(),
  translatedTitle: z.string().nullable().optional(),
  coverUrl: z.string().nullable(),
  chapterCount: z.number(),
  segmentCount: z.number(),
  createdAt: z.string(),
  projectId: z.string().nullable().optional(),
  volumeNumber: z.number().nullable().optional(),
});
export type BookSummary = z.infer<typeof BookSummarySchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectSummarySchema = ProjectSchema.extend({
  volumeCount: z.number(),
  coverUrl: z.string().nullable(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const ProjectDetailSchema = ProjectSchema.extend({
  books: z.array(BookSummarySchema),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const RenameProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type RenameProjectBody = z.infer<typeof RenameProjectBodySchema>;

export const VolumeNumberSchema = z.number().min(0).max(9999);

export const ImportPlacementSchema = z.union([
  z.strictObject({ projectId: z.string().min(1), volumeNumber: VolumeNumberSchema.nullable() }),
  z.strictObject({
    projectName: z.string().trim().min(1).max(200),
    volumeNumber: VolumeNumberSchema.nullable(),
  }),
]);
export type ImportPlacement = z.infer<typeof ImportPlacementSchema>;

export const ImportPreviewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duplicate"), book: BookSummarySchema }),
  z.object({
    kind: z.literal("new"),
    title: z.string(),
    seriesTitle: z.string(),
    volumeNumber: z.number().nullable(),
    project: ProjectSchema.nullable(),
  }),
]);
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const SetVolumeNumberBodySchema = z.object({ volumeNumber: VolumeNumberSchema });
export type SetVolumeNumberBody = z.infer<typeof SetVolumeNumberBodySchema>;

export const MoveBookBodySchema = z.object({ projectId: z.string().min(1) });
export type MoveBookBody = z.infer<typeof MoveBookBodySchema>;

export const GlossaryEntrySchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  note: z.string().optional(),
});
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

export const BookSettingsSchema = z.object({
  provider: ProviderIdSchema.nullable(),
  model: z.string().nullable(),
});
export type BookSettings = z.infer<typeof BookSettingsSchema>;

export const LegacyBookTermsSchema = z.object({
  customPrompt: z.string().default(""),
  glossary: z.array(GlossaryEntrySchema).default([]),
});
export type LegacyBookTerms = z.infer<typeof LegacyBookTermsSchema>;

export const MAX_GLOSSARY_ENTRIES = 2000;
export const MAX_CUSTOM_PROMPT = 4000;

export const ProjectTermsSchema = z.object({
  customPrompt: z.string().max(MAX_CUSTOM_PROMPT),
  glossary: z.array(GlossaryEntrySchema).max(MAX_GLOSSARY_ENTRIES),
});
export type ProjectTerms = z.infer<typeof ProjectTermsSchema>;

export const GlossaryRenderingSchema = z.object({
  target: z.string().min(1),
  note: z.string().optional(),
  bookId: z.string(),
  volumeNumber: z.number().nullable(),
});
export type GlossaryRendering = z.infer<typeof GlossaryRenderingSchema>;

export const GlossaryConflictSchema = z.object({
  source: z.string().min(1),
  inForce: GlossaryRenderingSchema,
  alternatives: z.array(GlossaryRenderingSchema).min(1),
});
export type GlossaryConflict = z.infer<typeof GlossaryConflictSchema>;

export const ResolveGlossaryConflictSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
});
export type ResolveGlossaryConflict = z.infer<typeof ResolveGlossaryConflictSchema>;

export const ProjectSettingsSchema = ProjectTermsSchema.extend({
  glossaryConflicts: z.array(GlossaryConflictSchema),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const BookDetailSchema = BookSummarySchema.extend({
  chapters: z.array(ChapterSummarySchema),
  settings: BookSettingsSchema,
});
export type BookDetail = z.infer<typeof BookDetailSchema>;

export const ExportLayoutSchema = z.enum(["translation", "bilingual"]);
export type ExportLayout = z.infer<typeof ExportLayoutSchema>;

export const ExportQuerySchema = z.object({
  layout: ExportLayoutSchema.default("translation"),
});
export const TranslateModeSchema = z.enum(["live", "batch"]);
export type TranslateMode = z.infer<typeof TranslateModeSchema>;

export const TranslateBodySchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  mode: TranslateModeSchema.default("live"),
});
export type TranslateBody = z.input<typeof TranslateBodySchema>;

export const SampleSizeSchema = z.enum(["standard", "large", "volume"]);
export type SampleSize = z.infer<typeof SampleSizeSchema>;

export const SuggestGlossaryBodySchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  targetLang: z.string().min(1).optional(),
  sampleSize: SampleSizeSchema.optional(),
  chunk: z.number().int().min(0).optional(),
});
export type SuggestGlossaryBody = z.infer<typeof SuggestGlossaryBodySchema>;

export const GlossarySamplePlanQuerySchema = z.object({
  size: SampleSizeSchema.default("large"),
});

export const GlossarySamplePlanSchema = z.object({
  requests: z.number().int().positive(),
  chars: z.number().int().nonnegative(),
});
export type GlossarySamplePlan = z.infer<typeof GlossarySamplePlanSchema>;

export const ProviderInfoSchema = z.object({
  id: ProviderIdSchema,
  label: z.string(),
  configured: z.boolean(),
  models: z.array(z.string()),
  defaultModel: z.string(),
  termsModel: z.string().optional(),
  supportsBatch: z.boolean(),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const ChapterBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("segment"),
    id: z.string(),
    sourceHtml: z.string(),
    targetHtml: z.string().nullable(),
    status: SegmentStatusSchema,
    note: z.string().optional(),
  }),
  z.object({ kind: z.literal("static"), html: z.string() }),
]);
export type ChapterBlock = z.infer<typeof ChapterBlockSchema>;

export const ChapterViewSchema = z.object({
  chapterId: z.string(),
  index: z.number(),
  title: z.string(),
  prevChapterId: z.string().nullable(),
  nextChapterId: z.string().nullable(),
  part: z.number().int().min(0),
  partCount: z.number().int().min(1),
  blocks: z.array(ChapterBlockSchema),
});

export const ChapterPartQuerySchema = z.object({
  jobId: z.string().optional(),
  part: z.coerce.number().int().min(0).default(0),
});
export type ChapterView = z.infer<typeof ChapterViewSchema>;

export const ApiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiErrorSchema>;
