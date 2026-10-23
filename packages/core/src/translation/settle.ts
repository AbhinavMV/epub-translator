import type { Usage } from "@et/contracts";
import type { SegmentTranslation } from "../domain/segment.ts";
import type { SegmentBatchResult } from "../ports/translation-provider.ts";
import { stripTokens, validateTokens } from "./placeholders.ts";

export interface SourceSegment {
  id: string;
  text: string;
}

export interface Rejected {
  id: string;
  text: string;
  problem: string;
  received: string | null;
}

export interface Checked {
  accepted: Map<string, SegmentTranslation>;
  rejected: Rejected[];
}

function problemWith(source: string, translated: string | undefined): string | null {
  if (translated === undefined) return "missing from your response";
  if (translated.trim() === "" && source.trim() !== "") return "empty translation";
  return validateTokens(source, translated);
}

export function checkReturned(
  sources: readonly SourceSegment[],
  returned: readonly SourceSegment[],
): Checked {
  const byId = new Map<string, string>();
  for (const s of returned) if (!byId.has(s.id)) byId.set(s.id, s.text);

  const checked: Checked = { accepted: new Map(), rejected: [] };
  for (const s of sources) {
    const text = byId.get(s.id);
    const problem = problemWith(s.text, text);
    if (problem === null && text !== undefined) {
      checked.accepted.set(s.id, { text, status: "done" });
    } else {
      checked.rejected.push({
        id: s.id,
        text: s.text,
        problem: problem ?? "invalid",
        received: text ?? null,
      });
    }
  }
  return checked;
}

export function settleRejected(rejected: readonly Rejected[]): Map<string, SegmentTranslation> {
  const settled = new Map<string, SegmentTranslation>();
  for (const r of rejected) {
    const received = r.received?.trim() ? r.received : null;
    settled.set(
      r.id,
      received === null
        ? { text: "", status: "failed" }
        : { text: stripTokens(received), status: "flagged" },
    );
  }
  return settled;
}

export function settleOnce(
  sources: readonly SourceSegment[],
  result: SegmentBatchResult,
): { results: Map<string, SegmentTranslation>; usage: Usage } {
  if (result.kind !== "ok") {
    const usage = "usage" in result ? result.usage : { inputTokens: 0, outputTokens: 0 };
    const results = new Map<string, SegmentTranslation>();
    for (const s of sources) results.set(s.id, { text: "", status: "failed" });
    return { results, usage };
  }
  const { accepted, rejected } = checkReturned(sources, result.segments);
  for (const [id, t] of settleRejected(rejected)) accepted.set(id, t);
  return { results: accepted, usage: result.usage };
}

export function feedbackFor(rejected: readonly Rejected[]): string {
  const lines = rejected.map((r) => `- ${r.id}: ${r.problem}`);
  return [
    "Your previous answer for these segments was rejected:",
    ...lines,
    "Translate them again. Keep every placeholder tag exactly once, properly nested, never add new tags, and return one entry per id.",
  ].join("\n");
}
