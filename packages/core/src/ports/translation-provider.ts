import type { GlossaryEntry, ProviderId, TargetLanguage, Usage } from "@et/contracts";

export interface SegmentBatchRequest {
  model: string;
  sourceLang: string | null;
  target: TargetLanguage;
  bookTitle: string;
  context: { source: string; target: string }[];
  segments: { id: string; text: string }[];
  instructions?: string;
  glossary?: GlossaryEntry[];
  /** Explains why a previous attempt was rejected, for the retry. */
  feedback?: string;
}

export type SegmentBatchResult =
  | { kind: "ok"; segments: { id: string; text: string }[]; usage: Usage }
  | { kind: "truncated" | "refused"; usage: Usage }
  | { kind: "retryable"; retryAfterMs?: number; cause: string }
  | { kind: "fatal"; cause: string };

export interface TranslationProvider {
  readonly id: ProviderId;
  readonly label: string;
  listModels(): Promise<string[]>;
  translateSegments(req: SegmentBatchRequest, signal: AbortSignal): Promise<SegmentBatchResult>;
}
