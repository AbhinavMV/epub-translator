import type {
  GlossaryEntry,
  ProofreadEdit,
  ProofreadSegment,
  TargetLanguage,
  Usage,
} from "@et/contracts";

export interface ProofreadRequest {
  model: string;
  sourceLang: string | null;
  target: TargetLanguage;
  bookTitle: string;
  instructions?: string;
  glossary: GlossaryEntry[];
  notes: GlossaryEntry[];
  segments: ProofreadSegment[];
}

export type ProofreadResult =
  | { kind: "ok"; edits: ProofreadEdit[]; notes: GlossaryEntry[]; usage: Usage }
  | { kind: "retryable" | "fatal"; cause: string; retryAfterMs?: number };

export interface Proofreader {
  proofread(req: ProofreadRequest, signal: AbortSignal): Promise<ProofreadResult>;
}
