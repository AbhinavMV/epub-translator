import type { ProviderId } from "@et/contracts";
import type { SegmentBatchRequest, SegmentBatchResult, TranslationProvider } from "@et/core";

const TOKEN = /(<\/?\d+>|<x\d+\/>)/;

function prefixRuns(text: string, tag: string): string {
  return text
    .split(TOKEN)
    .map((part, i) => (i % 2 === 1 || part.trim() === "" ? part : `${tag} ${part}`))
    .join("");
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class FakeProvider implements TranslationProvider {
  readonly id: ProviderId = "fake";
  readonly label = "Offline test (no translation)";

  constructor(private readonly options: { delayMs?: number } = {}) {}

  async listModels(): Promise<string[]> {
    return ["fake-echo"];
  }

  async translateSegments(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<SegmentBatchResult> {
    signal.throwIfAborted();
    if (this.options.delayMs) await delay(this.options.delayMs, signal);
    const tag = `[${req.target.code}]`;
    const segments = req.segments.map((s) => ({ id: s.id, text: prefixRuns(s.text, tag) }));
    const chars = req.segments.reduce((n, s) => n + s.text.length, 0);
    return { kind: "ok", segments, usage: { inputTokens: chars, outputTokens: chars } };
  }
}
