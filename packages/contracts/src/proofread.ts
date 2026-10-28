import { z } from "zod";
import { GlossaryEntrySchema, ProviderIdSchema, UsageSchema } from "./api.ts";
import { TargetLanguageSchema } from "./work.ts";

export const ProofreadKindSchema = z.enum([
  "accuracy",
  "consistency",
  "terminology",
  "fluency",
  "other",
]);
export type ProofreadKind = z.infer<typeof ProofreadKindSchema>;

export const SuggestionStateSchema = z.enum(["pending", "accepted", "rejected", "outdated"]);
export type SuggestionState = z.infer<typeof SuggestionStateSchema>;

export const ProofreadSuggestionSchema = z.object({
  segmentId: z.string(),
  kind: ProofreadKindSchema,
  before: z.string(),
  after: z.string(),
  reason: z.string(),
  state: SuggestionStateSchema,
});
export type ProofreadSuggestion = z.infer<typeof ProofreadSuggestionSchema>;

export const ChapterProofreadSchema = z.object({
  jobId: z.string(),
  chapterId: z.string(),
  model: z.string(),
  createdAt: z.string(),
  usage: UsageSchema,
  suggestions: z.array(ProofreadSuggestionSchema),
});
export type ChapterProofread = z.infer<typeof ChapterProofreadSchema>;

export const ProofreadSummarySchema = z.object({
  chapterId: z.string(),
  createdAt: z.string(),
  pending: z.number(),
  total: z.number(),
});
export type ProofreadSummary = z.infer<typeof ProofreadSummarySchema>;

export const ProofreadBodySchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  notes: z.array(GlossaryEntrySchema).max(500).default([]),
});
export type ProofreadBody = z.input<typeof ProofreadBodySchema>;

export const ProofreadSegmentSchema = z.object({
  id: z.string(),
  source: z.string(),
  translation: z.string(),
});
export type ProofreadSegment = z.infer<typeof ProofreadSegmentSchema>;

export const ProofreadInputSchema = z.object({
  sourceLang: z.string().nullable(),
  target: TargetLanguageSchema,
  bookTitle: z.string(),
  instructions: z.string().optional(),
  glossary: z.array(GlossaryEntrySchema),
  parts: z.array(z.array(ProofreadSegmentSchema)),
});
export type ProofreadInput = z.infer<typeof ProofreadInputSchema>;

export const ProofreadEditSchema = z.object({
  id: z.string(),
  kind: ProofreadKindSchema,
  text: z.string(),
  reason: z.string().max(1000),
});
export type ProofreadEdit = z.infer<typeof ProofreadEditSchema>;

export const ProofreadRunSchema = z.object({
  proofread: ChapterProofreadSchema,
  notes: z.array(GlossaryEntrySchema),
});
export type ProofreadRun = z.infer<typeof ProofreadRunSchema>;

export const RecordProofreadBodySchema = z.object({
  model: z.string().min(1),
  edits: z.array(ProofreadEditSchema).max(2000),
  usage: UsageSchema,
});
export type RecordProofreadBody = z.infer<typeof RecordProofreadBodySchema>;

export const ProofreadDecisionBodySchema = z.object({
  accept: z.array(z.string()).max(2000).default([]),
  reject: z.array(z.string()).max(2000).default([]),
});
export type ProofreadDecisionBody = z.input<typeof ProofreadDecisionBodySchema>;
