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
});
export type BookSummary = z.infer<typeof BookSummarySchema>;

export const GlossaryEntrySchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  note: z.string().optional(),
});
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

export const BookSettingsSchema = z.object({
  customPrompt: z.string().max(4000),
  glossary: z.array(GlossaryEntrySchema).max(500),
  provider: ProviderIdSchema.nullable(),
  model: z.string().nullable(),
});
export type BookSettings = z.infer<typeof BookSettingsSchema>;

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

export const SuggestGlossaryBodySchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  targetLang: z.string().min(1).optional(),
});
export type SuggestGlossaryBody = z.infer<typeof SuggestGlossaryBodySchema>;

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
  blocks: z.array(ChapterBlockSchema),
});
export type ChapterView = z.infer<typeof ChapterViewSchema>;

export const ApiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiErrorSchema>;
