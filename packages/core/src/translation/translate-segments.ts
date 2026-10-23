import type { Usage } from "@et/contracts";
import { FatalProviderError } from "../domain/errors.ts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { Sleep } from "../ports/system.ts";
import type {
  SegmentBatchRequest,
  SegmentBatchResult,
  TranslationProvider,
} from "../ports/translation-provider.ts";
import { checkReturned, feedbackFor, settleRejected } from "./settle.ts";

const MAX_BACKOFF_MS = 30_000;

export interface BatchOutcome {
  results: Map<string, SegmentTranslation>;
  usage: Usage;
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

    const { accepted, rejected } = checkReturned(req.segments, result.segments);
    for (const [id, t] of accepted) outcome.results.set(id, t);
    if (rejected.length === 0) return;

    if (isRetry) {
      for (const [id, t] of settleRejected(rejected)) outcome.results.set(id, t);
      return;
    }

    const retryReq: SegmentBatchRequest = {
      ...req,
      segments: rejected.map((r) => ({ id: r.id, text: r.text })),
      feedback: feedbackFor(rejected),
    };
    await this.run(retryReq, signal, outcome, true);
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
