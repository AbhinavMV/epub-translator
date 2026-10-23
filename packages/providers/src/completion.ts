import type { Usage } from "@et/contracts";
import type { SegmentBatchResult } from "@et/core";
import { parseSegmentsJson } from "./schema.ts";

export type RawCompletion =
  | { kind: "text"; text: string; usage: Usage }
  | { kind: "truncated" | "refused"; usage: Usage };

export function completionToResult(raw: RawCompletion): SegmentBatchResult {
  if (raw.kind !== "text") return { kind: raw.kind, usage: raw.usage };
  return { kind: "ok", segments: parseSegmentsJson(raw.text), usage: raw.usage };
}
