import type { GlossaryEntry, ProofreadBody } from "@et/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "./api-context";
import { keys } from "./keys";

export interface ProofreadRunState {
  running: boolean;
  done: number;
  total: number;
  chapterId: string | null;
  error: string | null;
}

const IDLE: ProofreadRunState = { running: false, done: 0, total: 0, chapterId: null, error: null };

export function useProofreadRun(jobId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ProofreadRunState>(IDLE);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (chapterIds: string[], body: Pick<ProofreadBody, "provider" | "model">) => {
      if (!jobId || controller.current || chapterIds.length === 0) return;
      const ctrl = new AbortController();
      controller.current = ctrl;
      let notes: GlossaryEntry[] = [];
      let done = 0;
      setState({ running: true, done: 0, total: chapterIds.length, chapterId: null, error: null });
      for (const chapterId of chapterIds) {
        if (ctrl.signal.aborted) break;
        setState((s) => ({ ...s, chapterId }));
        try {
          const run = await api.proofreadChapter(jobId, chapterId, { ...body, notes }, ctrl.signal);
          notes = run.notes;
          done++;
          queryClient.setQueryData(keys.proofread(jobId, chapterId), run.proofread);
          setState((s) => ({ ...s, done }));
          void queryClient.invalidateQueries({ queryKey: keys.proofreads(jobId) });
        } catch (err) {
          if (!ctrl.signal.aborted) {
            const message = err instanceof Error ? err.message : String(err);
            setState((s) => ({ ...s, error: message }));
          }
          break;
        }
      }
      controller.current = null;
      setState((s) => ({ ...s, running: false, chapterId: null }));
      void queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
    },
    [api, jobId, queryClient],
  );

  const stop = useCallback(() => controller.current?.abort(), []);
  const dismiss = useCallback(() => setState(IDLE), []);

  return { state, start, stop, dismiss };
}
