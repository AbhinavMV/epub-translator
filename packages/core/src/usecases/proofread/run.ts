import type {
  ChapterProofread,
  GlossaryEntry,
  ProofreadEdit,
  ProofreadInput,
  Usage,
} from "@et/contracts";
import { FatalProviderError } from "../../domain/errors.ts";
import type { Proofreader, ProofreadResult } from "../../ports/proofreader.ts";
import type { Repositories } from "../../ports/stores.ts";
import type { Clock, Sleep } from "../../ports/system.ts";
import { proofreadInput } from "./input.ts";
import { recordProofread } from "./record.ts";

const MAX_RETRIES = 5;
const MAX_BACKOFF_MS = 30_000;
export const MAX_PROOFREAD_NOTES = 200;

export interface ProofreadOutcome {
  edits: ProofreadEdit[];
  notes: GlossaryEntry[];
  usage: Usage;
}

export function mergeNotes(
  known: readonly GlossaryEntry[],
  found: readonly GlossaryEntry[],
): GlossaryEntry[] {
  const merged = new Map<string, GlossaryEntry>();
  for (const n of [...known, ...found]) {
    const source = n.source.trim();
    const target = n.target.trim();
    if (source && target && !merged.has(source)) merged.set(source, { source, target });
  }
  return [...merged.values()].slice(-MAX_PROOFREAD_NOTES);
}

async function attempt(
  proofreader: Proofreader,
  sleep: Sleep,
  run: () => Parameters<Proofreader["proofread"]>[0],
  signal: AbortSignal,
): Promise<Extract<ProofreadResult, { kind: "ok" }>> {
  for (let tries = 0; ; tries++) {
    signal.throwIfAborted();
    const result = await proofreader.proofread(run(), signal);
    if (result.kind === "ok") return result;
    if (result.kind === "fatal") throw new FatalProviderError(result.cause);
    if (tries >= MAX_RETRIES) {
      throw new FatalProviderError(`Gave up after ${tries + 1} attempts: ${result.cause}`);
    }
    await sleep(result.retryAfterMs ?? Math.min(MAX_BACKOFF_MS, 1000 * 2 ** tries), signal);
  }
}

/** Shared by the server and the browser, so both proofread a chapter the same way. */
export async function proofreadParts(
  proofreader: Proofreader,
  sleep: Sleep,
  input: ProofreadInput,
  model: string,
  notes: readonly GlossaryEntry[],
  signal: AbortSignal,
): Promise<ProofreadOutcome> {
  const outcome: ProofreadOutcome = {
    edits: [],
    notes: mergeNotes(notes, []),
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  for (const segments of input.parts) {
    const result = await attempt(
      proofreader,
      sleep,
      () => ({
        model,
        sourceLang: input.sourceLang,
        target: input.target,
        bookTitle: input.bookTitle,
        ...(input.instructions ? { instructions: input.instructions } : {}),
        glossary: input.glossary,
        notes: outcome.notes,
        segments,
      }),
      signal,
    );
    outcome.edits.push(...result.edits);
    outcome.notes = mergeNotes(outcome.notes, result.notes);
    outcome.usage.inputTokens += result.usage.inputTokens;
    outcome.usage.outputTokens += result.usage.outputTokens;
  }
  return outcome;
}

export interface RunProofreadDeps {
  repos: Repositories;
  proofreader: Proofreader;
  sleep: Sleep;
  clock: Clock;
}

export async function runProofread(
  deps: RunProofreadDeps,
  input: { jobId: string; chapterId: string; model: string; notes: readonly GlossaryEntry[] },
  signal: AbortSignal,
): Promise<{ proofread: ChapterProofread; notes: GlossaryEntry[] }> {
  const prepared = await proofreadInput(deps.repos, input.jobId, input.chapterId);
  const outcome = await proofreadParts(
    deps.proofreader,
    deps.sleep,
    prepared,
    input.model,
    input.notes,
    signal,
  );
  const proofread = await recordProofread(deps.repos, deps.clock, {
    jobId: input.jobId,
    chapterId: input.chapterId,
    model: input.model,
    edits: outcome.edits,
    usage: outcome.usage,
  });
  return { proofread, notes: outcome.notes };
}
