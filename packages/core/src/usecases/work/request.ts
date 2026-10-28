import { type BookSettings, getTargetLanguage } from "@et/contracts";
import type { ParsedBook, ParsedSegment } from "../../domain/book.ts";
import type { Job } from "../../domain/job.ts";
import type { SegmentBatchRequest } from "../../ports/translation-provider.ts";
import { promptExtras } from "../chapter-work.ts";

export interface RequestContext {
  job: Job;
  parsed: ParsedBook;
  settings: Pick<BookSettings, "customPrompt" | "glossary">;
  contextSize: number;
}

export function segmentRequest(
  ctx: RequestContext,
  model: string,
  segments: readonly ParsedSegment[],
  context: { source: string; target: string }[],
): SegmentBatchRequest {
  return {
    model,
    sourceLang: ctx.job.sourceLang,
    target: getTargetLanguage(ctx.job.targetLang),
    bookTitle: ctx.parsed.title,
    context: context.slice(-ctx.contextSize),
    segments: segments.map((s) => ({ id: s.id, text: s.sourceText })),
    ...promptExtras(ctx.settings.customPrompt, ctx.settings.glossary),
  };
}
