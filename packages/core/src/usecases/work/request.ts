import { getTargetLanguage, type ProjectTerms } from "@et/contracts";
import type { ParsedBook, ParsedSegment } from "../../domain/book.ts";
import type { Job } from "../../domain/job.ts";
import type { SegmentBatchRequest } from "../../ports/translation-provider.ts";
import { glossaryUsedIn } from "../../translation/glossary.ts";
import { promptExtras } from "../chapter-work.ts";

export interface RequestContext {
  job: Job;
  parsed: ParsedBook;
  terms: ProjectTerms;
  contextSize: number;
}

export function segmentRequest(
  ctx: RequestContext,
  model: string,
  segments: readonly ParsedSegment[],
  context: { source: string; target: string }[],
): SegmentBatchRequest {
  const recent = context.slice(-ctx.contextSize);
  const glossary = glossaryUsedIn(ctx.terms.glossary, [
    ...segments.map((s) => s.sourceText),
    ...recent.map((c) => c.source),
  ]);
  return {
    model,
    sourceLang: ctx.job.sourceLang,
    target: getTargetLanguage(ctx.job.targetLang),
    bookTitle: ctx.parsed.title,
    context: recent,
    segments: segments.map((s) => ({ id: s.id, text: s.sourceText })),
    ...promptExtras(ctx.terms.customPrompt, glossary),
  };
}
