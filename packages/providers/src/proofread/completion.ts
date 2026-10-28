import type { ProofreadResult } from "@et/core";
import type { RawCompletion } from "../completion.ts";
import { parseProofreadJson } from "./schema.ts";

export function proofreadResult(raw: RawCompletion): ProofreadResult {
  if (raw.kind === "truncated") {
    return { kind: "fatal", cause: "The model's answer was cut off while proofreading" };
  }
  if (raw.kind !== "text") return { kind: "fatal", cause: "The model declined to proofread" };
  const parsed = parseProofreadJson(raw.text);
  if (!parsed)
    return { kind: "retryable", cause: "The model returned malformed proofreading JSON" };
  return { kind: "ok", ...parsed, usage: raw.usage };
}
