import { describe, expect, it } from "vitest";
import type { GlossarySuggestion } from "@/api/client";
import { runSuggestions, type SuggestionStep, totalPlan } from "@/api/suggestion-run";

const steps: SuggestionStep[] = [
  { bookId: "b1", chunk: 0 },
  { bookId: "b1", chunk: 1 },
  { bookId: "b1", chunk: 2 },
];

const reply = (terms: [string, string][]): GlossarySuggestion => ({
  terms: terms.map(([source, target]) => ({ source, target })),
  usage: { inputTokens: 100, outputTokens: 10 },
});

describe("runSuggestions", () => {
  it("fetches every step in order, merging with the earliest rendering winning and summing usage", async () => {
    const seen: SuggestionStep[] = [];
    const progress: number[] = [];
    const replies = [
      reply([["魔王", "Demon King"]]),
      reply([
        ["魔王", "Overlord"],
        ["勇者", "Hero"],
      ]),
      reply([["聖女", "Saint"]]),
    ];
    const out = await runSuggestions(
      steps,
      async (step) => {
        seen.push(step);
        return replies[step.chunk] as GlossarySuggestion;
      },
      { signal: new AbortController().signal, onProgress: (p) => progress.push(p.done) },
    );
    expect(seen).toEqual(steps);
    expect(out.outcome).toBe("done");
    expect(out.terms.map((t) => `${t.source}=${t.target}`)).toEqual([
      "魔王=Demon King",
      "勇者=Hero",
      "聖女=Saint",
    ]);
    expect(out.usage).toEqual({ inputTokens: 300, outputTokens: 30 });
    expect(progress).toEqual([1, 2, 3]);
  });

  it("stops when aborted and keeps the terms gathered so far", async () => {
    const ctrl = new AbortController();
    const out = await runSuggestions(
      steps,
      async (step, signal) => {
        if (step.chunk === 1) {
          ctrl.abort();
          throw new Error(signal.aborted ? "aborted" : "late");
        }
        return reply([["魔王", "Demon King"]]);
      },
      { signal: ctrl.signal },
    );
    expect(out.outcome).toBe("stopped");
    expect(out.error).toBeNull();
    expect(out.terms).toEqual([{ source: "魔王", target: "Demon King" }]);
  });

  it("ends on a failed request and keeps the terms gathered so far", async () => {
    let calls = 0;
    const out = await runSuggestions(
      steps,
      async (step) => {
        calls++;
        if (step.chunk === 1) throw new Error("rate limited");
        return reply([["魔王", "Demon King"]]);
      },
      { signal: new AbortController().signal },
    );
    expect(calls).toBe(2);
    expect(out.outcome).toBe("error");
    expect(out.error).toBe("rate limited");
    expect(out.terms).toHaveLength(1);
  });
});

describe("totalPlan", () => {
  it("adds up every volume's requests and characters", () => {
    expect(
      totalPlan([
        { requests: 3, chars: 90_000 },
        { requests: 1, chars: 12_000 },
      ]),
    ).toEqual({ requests: 4, chars: 102_000 });
    expect(totalPlan([])).toEqual({ requests: 0, chars: 0 });
  });
});
