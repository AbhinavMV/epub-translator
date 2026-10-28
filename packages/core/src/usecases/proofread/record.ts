import type { ChapterProofread, ProofreadEdit, ProofreadSuggestion, Usage } from "@et/contracts";
import type { Repositories } from "../../ports/stores.ts";
import type { Clock } from "../../ports/system.ts";
import { stripTokens, validateTokens } from "../../translation/placeholders.ts";
import { loadChapterJob } from "../work/plan-work-unit.ts";

const MAX_REASON_CHARS = 500;

export interface RecordProofreadInput {
  jobId: string;
  chapterId: string;
  model: string;
  edits: readonly ProofreadEdit[];
  usage: Usage;
}

/** Edits come from a model, or from a browser relaying one: keep only real, well-formed changes. */
export async function recordProofread(
  repos: Repositories,
  clock: Clock,
  input: RecordProofreadInput,
): Promise<ChapterProofread> {
  const { parsed } = await loadChapterJob(repos, input.jobId, input.chapterId);
  const segments = parsed.segments.filter((s) => s.chapterId === input.chapterId);
  const translations = await repos.translations.forSegments(
    input.jobId,
    segments.map((s) => s.id),
  );
  const sources = new Map(segments.map((s) => [s.id, s.sourceText]));
  const order = new Map(segments.map((s, i) => [s.id, i]));

  const byId = new Map<string, ProofreadSuggestion>();
  for (const edit of input.edits) {
    const source = sources.get(edit.id);
    const current = translations.get(edit.id);
    if (source === undefined || !current || current.status === "failed" || byId.has(edit.id)) {
      continue;
    }
    const flagged = current.status === "flagged";
    const after = (flagged ? stripTokens(edit.text) : edit.text).trim();
    if (after === "" || after === current.text.trim()) continue;
    if (!flagged && validateTokens(source, after) !== null) continue;
    byId.set(edit.id, {
      segmentId: edit.id,
      kind: edit.kind,
      before: current.text,
      after,
      reason: edit.reason.trim().slice(0, MAX_REASON_CHARS),
      state: "pending",
    });
  }

  const usage = {
    inputTokens: Math.max(0, input.usage.inputTokens),
    outputTokens: Math.max(0, input.usage.outputTokens),
  };
  await repos.jobs.addUsage(input.jobId, usage);
  const proofread: ChapterProofread = {
    jobId: input.jobId,
    chapterId: input.chapterId,
    model: input.model,
    createdAt: clock.now().toISOString(),
    usage,
    suggestions: [...byId.values()].sort(
      (a, b) => (order.get(a.segmentId) ?? 0) - (order.get(b.segmentId) ?? 0),
    ),
  };
  await repos.proofreads.put(proofread);
  return proofread;
}
