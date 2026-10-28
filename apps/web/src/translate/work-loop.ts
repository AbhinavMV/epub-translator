import type { ChapterProgress, ResultSegment, WorkUnitDto } from "@et/contracts";
import {
  FatalProviderError,
  type SegmentBatchRequest,
  SegmentTranslator,
  type Sleep,
} from "@et/core";
import type { BrowserProvider } from "@et/providers/browser";
import { ApiRequestError } from "@/api/client";
import type { KeyedProvider } from "@/keys/envelope";
import type { WorkApi } from "./work-api";

export const DEFAULT_CONCURRENCY = 2;
const POST_ATTEMPTS = 3;

export interface LoopDeps {
  api: WorkApi;
  bundleFor(provider: KeyedProvider, model: string): BrowserProvider;
  redact(provider: KeyedProvider, text: string): string;
  sleep: Sleep;
  concurrency?: () => number;
}

export interface ChapterRun {
  provider: KeyedProvider;
  model: string;
}

export interface ChapterHooks {
  signal: AbortSignal;
  onProgress?: (progress: ChapterProgress) => void;
}

export function requestOf(unit: WorkUnitDto, model: string): SegmentBatchRequest {
  return {
    model,
    sourceLang: unit.sourceLang,
    target: unit.target,
    bookTitle: unit.bookTitle,
    context: unit.context,
    segments: unit.segments,
    ...(unit.instructions ? { instructions: unit.instructions } : {}),
    ...(unit.glossary ? { glossary: unit.glossary } : {}),
  };
}

export class WorkLoop {
  constructor(private readonly deps: LoopDeps) {}

  async runChapter(
    jobId: string,
    chapterId: string,
    run: ChapterRun,
    hooks: ChapterHooks,
  ): Promise<ChapterProgress | null> {
    const { api } = this.deps;
    const translator = new SegmentTranslator(
      this.deps.bundleFor(run.provider, run.model).provider,
      this.deps.sleep,
    );
    const stop = new AbortController();
    const relay = () => stop.abort();
    if (hooks.signal.aborted) return null;
    hooks.signal.addEventListener("abort", relay, { once: true });

    let cursor: string | undefined;
    let last: ChapterProgress | null = null;
    let failure: unknown = null;
    let leasing: Promise<unknown> = Promise.resolve();
    const unsettled = new Set<string>();

    const nextUnit = (): Promise<WorkUnitDto | null> => {
      const turn = leasing.then(async () => {
        const unit = await api.lease(jobId, chapterId, cursor);
        if (unit) {
          cursor = unit.segments.at(-1)?.id ?? cursor;
          unsettled.add(unit.leaseId);
        }
        return unit;
      });
      leasing = turn.catch(() => undefined);
      return turn;
    };

    const fail = (err: unknown) => {
      failure ??= err;
      stop.abort();
    };

    const worker = async () => {
      while (!stop.signal.aborted) {
        let unit: WorkUnitDto | null;
        try {
          unit = await nextUnit();
        } catch (err) {
          return fail(err);
        }
        if (!unit || stop.signal.aborted) return;
        try {
          const outcome = await translator.translateBatch(requestOf(unit, run.model), stop.signal);
          if (stop.signal.aborted) return;
          const segments: ResultSegment[] = unit.segments.flatMap((s) => {
            const r = outcome.results.get(s.id);
            return r
              ? [{ id: s.id, text: r.text, status: r.status, ...(r.note ? { note: r.note } : {}) }]
              : [];
          });
          const progress = await this.post(jobId, unit.leaseId, segments, outcome.usage);
          unsettled.delete(unit.leaseId);
          if (progress) {
            last = progress;
            hooks.onProgress?.(progress);
          }
        } catch (err) {
          if (stop.signal.aborted) return;
          fail(err);
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: this.deps.concurrency?.() ?? DEFAULT_CONCURRENCY }, () => worker()),
      );
    } finally {
      hooks.signal.removeEventListener("abort", relay);
      await Promise.allSettled([...unsettled].map((id) => api.deleteLease(jobId, id)));
    }
    if (failure !== null && !hooks.signal.aborted) throw this.describe(run.provider, failure);
    return last;
  }

  private async post(
    jobId: string,
    leaseId: string,
    segments: ResultSegment[],
    usage: { inputTokens: number; outputTokens: number },
  ): Promise<ChapterProgress | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.deps.api.postResults(jobId, { leaseId, segments, usage });
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 409) return null;
        const transient = err instanceof ApiRequestError && err.status === 0;
        if (!transient || attempt >= POST_ATTEMPTS) throw err;
        await this.deps.sleep(500 * 2 ** attempt);
      }
    }
  }

  describe(provider: KeyedProvider, err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err);
    const clean = this.deps.redact(provider, message);
    if (err instanceof FatalProviderError) return new FatalProviderError(clean);
    if (err instanceof ApiRequestError) return new ApiRequestError(clean, err.status);
    return new Error(clean);
  }
}
