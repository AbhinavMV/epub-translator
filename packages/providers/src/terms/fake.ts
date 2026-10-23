import type { TermExtractionRequest, TermExtractionResult, TermExtractor } from "@et/core";

const CANDIDATE = /[A-Z][a-z]+|[゠-ヿ]{3,}/g;
const MAX_TERMS = 5;

export class FakeTermExtractor implements TermExtractor {
  async extractTerms(
    req: TermExtractionRequest,
    signal: AbortSignal,
  ): Promise<TermExtractionResult> {
    signal.throwIfAborted();
    const known = new Set(req.existing.map((e) => e.source));
    const found = [...new Set(req.sample.match(CANDIDATE) ?? [])].filter((s) => !known.has(s));
    const terms = found.slice(0, MAX_TERMS).map((source) => ({
      source,
      target: `[${req.target.code}] ${source}`,
      note: "fake suggestion",
    }));
    return {
      kind: "ok",
      terms,
      usage: { inputTokens: req.sample.length, outputTokens: terms.length * 8 },
    };
  }
}
