import type { TermExtractionResult } from "@et/core";
import type { RawCompletion } from "../completion.ts";
import { parseTermsJson } from "./schema.ts";

export function termsResult(raw: RawCompletion): TermExtractionResult {
  if (raw.kind === "truncated") {
    return { kind: "fatal", cause: "The model's answer was cut off; try a smaller book sample" };
  }
  if (raw.kind !== "text") return { kind: "fatal", cause: "The model declined the request" };
  return { kind: "ok", terms: parseTermsJson(raw.text), usage: raw.usage };
}
