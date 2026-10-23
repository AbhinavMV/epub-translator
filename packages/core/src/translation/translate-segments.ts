import type { Usage } from "@et/contracts";
import { FatalProviderError } from "../domain/errors.ts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { Sleep } from "../ports/system.ts";
import type {
  SegmentBatchRequest,
  SegmentBatchResult,
  TranslationProvider,
} from "../ports/translation-provider.ts";
import { stripTokens, validateTokens } from "./placeholders.ts";

const MAX_BACKOFF_MS = 30_000;

export interface BatchOutcome {
  results: Map<string, SegmentTranslation>;
  usage: Usage;
}

interface Rejected {
  id: string;
  text: string;
  problem: string;
  received: string | null;
}

export class SegmentTranslator {
  constructor(
    private readonly provider: TranslationProvider,
    private readonly sleep: Sleep,
    private readonly maxRetries = 5,
  ) {}

  async translateBatch(req: SegmentBatchRequest, signal: AbortSignal): Promise<BatchOutcome> {
    const outcome: BatchOutcome = {
      results: new Map(),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    await this.run(req, signal, outcome, false);
    return outcome;
  }

  private async run(
    req: SegmentBatchRequest,
    signal: AbortSignal,
    outcome: BatchOutcome,
    isRetry: boolean,
  ): Promise<void> {
    const result = await this.call(req, signal);
    if (result.kind === "fatal") {
      throw new FatalProviderError(result.cause);
    }
    outcome.usage.inputTokens += result.usage.inputTokens;
    outcome.usage.outputTokens += result.usage.outputTokens;

    if (result.kind !== "ok") {
      await this.splitOrFail(req, signal, outcome, isRetry);
      return;
    }

    const returned = new Map<string, string>();
    for (const s of result.segments) if (!returned.has(s.id)) returned.set(s.id, s.text);

    const rejected: Rejected[] = [];
    for (const s of req.segments) {
      const text = returned.get(s.id);
      const problem = this.problemWith(s.text, text);
      if (problem === null && text !== undefined) {
        outcome.results.set(s.id, { text, status: "done" });
      } else {
        rejected.push({
          id: s.id,
          text: s.text,
          problem: problem ?? "invalid",
          received: text ?? null,
        });
      }
    }
    if (rejected.length === 0) return;

    if (isRetry) {
      for (const r of rejected) {
        outcome.results.set(r.id, {
          text: stripTokens(r.received ?? r.text),
          status: "flagged",
        });
      }
      return;
    }

    const retryReq: SegmentBatchRequest = {
      ...req,
      segments: rejected.map((r) => ({ id: r.id, text: r.text })),
      feedback: feedbackFor(rejected),
    };
    await this.run(retryReq, signal, outcome, true);
  }

  private problemWith(source: string, translated: string | undefined): string | null {
    if (translated === undefined) return "missing from your response";
    if (translated.trim() === "" && source.trim() !== "") return "empty translation";
    return validateTokens(source, translated);
  }

  private async splitOrFail(
    req: SegmentBatchRequest,
    signal: AbortSignal,
    outcome: BatchOutcome,
    isRetry: boolean,
  ): Promise<void> {
    if (req.segments.length === 1) {
      const only = req.segments[0];
      if (only) outcome.results.set(only.id, { text: "", status: "failed" });
      return;
    }
    const mid = Math.ceil(req.segments.length / 2);
    for (const half of [req.segments.slice(0, mid), req.segments.slice(mid)]) {
      await this.run({ ...req, segments: half }, signal, outcome, isRetry);
    }
  }

  private async call(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<Exclude<SegmentBatchResult, { kind: "retryable" }>> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const result = await this.provider.translateSegments(req, signal);
      if (result.kind !== "retryable") return result;
      if (attempt >= this.maxRetries) {
        throw new FatalProviderError(`Gave up after ${attempt + 1} attempts: ${result.cause}`);
      }
      await this.sleep(
        result.retryAfterMs ?? Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt),
        signal,
      );
    }
  }
}

function feedbackFor(rejected: Rejected[]): string {
  const lines = rejected.map((r) => `- ${r.id}: ${r.problem}`);
  return [
    "Your previous answer for these segments was rejected:",
    ...lines,
    "Translate them again. Keep every placeholder tag exactly once, properly nested, never add new tags, and return one entry per id.",
  ].join("\n");
}
