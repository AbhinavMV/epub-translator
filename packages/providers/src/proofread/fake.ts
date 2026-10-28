import type { Proofreader, ProofreadRequest, ProofreadResult } from "@et/core";

/** Flags every segment whose translation still contains doubled spaces, and tidies them. */
export class FakeProofreader implements Proofreader {
  async proofread(req: ProofreadRequest, signal: AbortSignal): Promise<ProofreadResult> {
    signal.throwIfAborted();
    const edits = req.segments
      .filter((s) => / {2,}/.test(s.translation))
      .map((s) => ({
        id: s.id,
        kind: "fluency" as const,
        text: s.translation.replace(/ {2,}/g, " "),
        reason: "Collapse doubled spaces",
      }));
    const chars = req.segments.reduce((n, s) => n + s.source.length + s.translation.length, 0);
    return {
      kind: "ok",
      edits,
      notes: [],
      usage: { inputTokens: chars, outputTokens: edits.length * 8 },
    };
  }
}
