import type { Usage } from "@et/contracts";
import type { SegmentBatchResult } from "@et/core";
import { parseSegmentsJson } from "./schema.ts";

export type RawCompletion =
  | { kind: "text"; text: string; usage: Usage }
  | { kind: "truncated"; usage: Usage }
  | { kind: "refused"; usage: Usage; category?: string | null };

export function completionToResult(raw: RawCompletion): SegmentBatchResult {
  if (raw.kind === "refused") {
    return raw.category
      ? { kind: "refused", usage: raw.usage, category: raw.category }
      : { kind: "refused", usage: raw.usage };
  }
  if (raw.kind !== "text") return { kind: raw.kind, usage: raw.usage };
  return { kind: "ok", segments: parseSegmentsJson(raw.text), usage: raw.usage };
}
