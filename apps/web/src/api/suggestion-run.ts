import type { GlossaryEntry, GlossarySamplePlan, Usage } from "@et/contracts";
import { mergeSuggestions } from "@/lib/merge-suggestions";
import type { GlossarySuggestion } from "./client";

export interface SuggestionStep {
  bookId: string;
  chunk: number;
}

export interface SuggestionProgress {
  done: number;
  total: number;
  step: SuggestionStep;
  terms: GlossaryEntry[];
  usage: Usage | null;
}

export interface SuggestionRunResult {
  terms: GlossaryEntry[];
  usage: Usage | null;
  outcome: "done" | "stopped" | "error";
  error: string | null;
}

export type FetchChunk = (step: SuggestionStep, signal: AbortSignal) => Promise<GlossarySuggestion>;

export function totalPlan(plans: readonly GlossarySamplePlan[]): GlossarySamplePlan {
  return plans.reduce(
    (sum, p) => ({ requests: sum.requests + p.requests, chars: sum.chars + p.chars }),
    {
      requests: 0,
      chars: 0,
    },
  );
}

export function chunkSteps(bookId: string, requests: number): SuggestionStep[] {
  return Array.from({ length: requests }, (_, chunk) => ({ bookId, chunk }));
}

const addUsage = (a: Usage | null, b: Usage | null): Usage | null =>
  a && b
    ? { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }
    : (a ?? b);

export async function runSuggestions(
  steps: readonly SuggestionStep[],
  fetchChunk: FetchChunk,
  options: { signal: AbortSignal; onProgress?: (progress: SuggestionProgress) => void },
): Promise<SuggestionRunResult> {
  let terms: GlossaryEntry[] = [];
  let usage: Usage | null = null;
  const end = (outcome: SuggestionRunResult["outcome"], error: string | null = null) => ({
    terms,
    usage,
    outcome,
    error,
  });

  for (const [i, step] of steps.entries()) {
    if (options.signal.aborted) return end("stopped");
    try {
      const result = await fetchChunk(step, options.signal);
      if (options.signal.aborted) return end("stopped");
      terms = mergeSuggestions(terms, result.terms);
      usage = addUsage(usage, result.usage);
    } catch (err) {
      if (options.signal.aborted) return end("stopped");
      return end("error", err instanceof Error ? err.message : String(err));
    }
    options.onProgress?.({ done: i + 1, total: steps.length, step, terms, usage });
  }
  return end("done");
}
