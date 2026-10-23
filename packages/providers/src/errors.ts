import type { SegmentBatchResult } from "@et/core";

type Failure = Extract<SegmentBatchResult, { kind: "retryable" | "fatal" }>;

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429]);

export function failureFromStatus(status: number, message: string, retryAfterMs?: number): Failure {
  const cause = `HTTP ${status}: ${message}`;
  if (RETRYABLE_STATUSES.has(status) || status >= 500) {
    return retryAfterMs === undefined
      ? { kind: "retryable", cause }
      : { kind: "retryable", retryAfterMs, cause };
  }
  return { kind: "fatal", cause };
}

export function retryAfterMs(headers: Headers | undefined): number | undefined {
  if (!headers) return undefined;
  const ms = Number(headers.get("retry-after-ms"));
  if (headers.get("retry-after-ms") !== null && Number.isFinite(ms) && ms >= 0) return ms;
  const seconds = Number(headers.get("retry-after"));
  if (headers.get("retry-after") !== null && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return undefined;
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
