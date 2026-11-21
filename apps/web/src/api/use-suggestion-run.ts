import type { GlossaryEntry, SuggestGlossaryBody, Usage } from "@et/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "./api-context";
import { runSuggestions, type SuggestionStep } from "./suggestion-run";

export interface SuggestionRunState {
  running: boolean;
  done: number;
  total: number;
  step: SuggestionStep | null;
  terms: GlossaryEntry[];
  usage: Usage | null;
  error: string | null;
}

const IDLE: SuggestionRunState = {
  running: false,
  done: 0,
  total: 0,
  step: null,
  terms: [],
  usage: null,
  error: null,
};

export type SuggestionRequest = Omit<SuggestGlossaryBody, "chunk">;

export function useSuggestionRun() {
  const api = useApi();
  const [state, setState] = useState<SuggestionRunState>(IDLE);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (steps: SuggestionStep[], body: SuggestionRequest) => {
      if (controller.current || steps.length === 0) return;
      const ctrl = new AbortController();
      controller.current = ctrl;
      setState({ ...IDLE, running: true, total: steps.length, step: steps[0] ?? null });
      const result = await runSuggestions(
        steps,
        (step, signal) => api.suggestGlossary(step.bookId, { ...body, chunk: step.chunk }, signal),
        {
          signal: ctrl.signal,
          onProgress: (p) =>
            setState((s) => ({
              ...s,
              done: p.done,
              step: steps[p.done] ?? p.step,
              terms: p.terms,
              usage: p.usage,
            })),
        },
      );
      if (controller.current !== ctrl) return;
      controller.current = null;
      setState((s) => ({
        ...s,
        running: false,
        terms: result.terms,
        usage: result.usage,
        error: result.error,
      }));
    },
    [api],
  );

  const stop = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState(IDLE);
  }, []);

  return { state, start, stop, reset };
}
