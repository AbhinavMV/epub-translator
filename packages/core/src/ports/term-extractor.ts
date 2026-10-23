import type { GlossaryEntry, TargetLanguage, Usage } from "@et/contracts";

export interface TermExtractionRequest {
  model: string;
  sourceLang: string | null;
  target: TargetLanguage;
  bookTitle: string;
  sample: string;
  existing: GlossaryEntry[];
}

export type TermExtractionResult =
  | { kind: "ok"; terms: GlossaryEntry[]; usage: Usage }
  | { kind: "retryable" | "fatal"; cause: string };

export interface TermExtractor {
  extractTerms(req: TermExtractionRequest, signal: AbortSignal): Promise<TermExtractionResult>;
}
