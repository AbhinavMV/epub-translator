import type { ChapterProgress, RecordedBatch, ResultSegment } from "@et/contracts";
import { failureNote, MISSING_NOTE, type SegmentBatchResult } from "@et/core";
import type { BrowserProvider } from "@et/providers/browser";
import type { KeyedProvider } from "@/keys/envelope";
import type { WorkApi } from "./work-api";
import { requestOf } from "./work-loop";

export interface BatchDeps {
  api: WorkApi;
  bundleFor(provider: KeyedProvider): BrowserProvider | null;
}

export async function submitChapterBatch(
  deps: BatchDeps,
  jobId: string,
  chapterId: string,
  run: { provider: KeyedProvider; model: string },
): Promise<boolean> {
  const bundle = deps.bundleFor(run.provider);
  if (!bundle) throw new Error("Unlock your keys first");
  const { units } = await deps.api.batchPlan(jobId, chapterId);
  if (units.length === 0) return false;

  const vendorBatchId = await bundle.batch.submit(
    units.map((unit) => ({
      customId: unit.customId,
      request: requestOf({ leaseId: "", jobId, chapterId, ...unit }, run.model),
    })),
  );
  try {
    await deps.api.recordBatch(jobId, {
      chapterId,
      provider: run.provider,
      model: run.model,
      vendorBatchId,
      segmentIds: units.map((u) => u.segments.map((s) => s.id)),
    });
  } catch (err) {
    await bundle.batch.cancel(vendorBatchId).catch(() => undefined);
    throw err;
  }
  return true;
}

export function resultsOf(
  segmentIds: readonly (readonly string[])[],
  results: ReadonlyMap<string, SegmentBatchResult>,
): { segments: ResultSegment[]; usage: { inputTokens: number; outputTokens: number } } {
  const segments: ResultSegment[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (const [index, ids] of segmentIds.entries()) {
    const result = results.get(String(index));
    if (result?.kind === "ok") {
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      const returned = new Map(result.segments.map((s) => [s.id, s.text]));
      for (const id of ids) {
        const text = returned.get(id);
        segments.push(
          text === undefined
            ? { id, text: "", status: "failed", note: MISSING_NOTE }
            : { id, text, status: "done" },
        );
      }
      continue;
    }
    if (result && "usage" in result) {
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }
    const note = result ? failureNote(result) : "missing from batch output";
    for (const id of ids) segments.push({ id, text: "", status: "failed", note });
  }
  return { segments, usage };
}

export interface PollOutcome {
  progress: ChapterProgress[];
  waitingOnKeys: boolean;
}

export async function pollClientBatches(
  deps: BatchDeps,
  jobId: string,
  redact: (provider: KeyedProvider, text: string) => string,
): Promise<PollOutcome> {
  const outcome: PollOutcome = { progress: [], waitingOnKeys: false };
  for (const batch of await deps.api.listBatches(jobId)) {
    const provider = batch.provider as KeyedProvider;
    const bundle = deps.bundleFor(provider);
    if (!bundle) {
      outcome.waitingOnKeys = true;
      continue;
    }
    outcome.progress.push(...(await settleBatch(deps, jobId, batch, bundle, provider, redact)));
  }
  return outcome;
}

async function settleBatch(
  deps: BatchDeps,
  jobId: string,
  batch: RecordedBatch,
  bundle: BrowserProvider,
  provider: KeyedProvider,
  redact: (provider: KeyedProvider, text: string) => string,
): Promise<ChapterProgress[]> {
  let fetched: Awaited<ReturnType<BrowserProvider["batch"]["fetch"]>>;
  try {
    fetched = await bundle.batch.fetch(batch.vendorBatchId);
  } catch {
    return [];
  }
  if (fetched.status === "in_progress") return [];
  if (fetched.status === "failed") {
    return [
      await deps.api.endBatch(jobId, batch.id, {
        status: "failed",
        error: redact(provider, fetched.cause).slice(0, 500),
      }),
    ];
  }
  const body = resultsOf(batch.segmentIds, fetched.results);
  return [await deps.api.postBatchResults(jobId, batch.id, body)];
}

export async function cancelClientBatches(
  deps: BatchDeps,
  jobId: string,
  chapterId?: string,
): Promise<void> {
  for (const batch of await deps.api.listBatches(jobId)) {
    if (chapterId !== undefined && batch.chapterId !== chapterId) continue;
    const bundle = deps.bundleFor(batch.provider as KeyedProvider);
    await bundle?.batch.cancel(batch.vendorBatchId).catch(() => undefined);
    await deps.api.endBatch(jobId, batch.id, { status: "cancelled" });
  }
}
