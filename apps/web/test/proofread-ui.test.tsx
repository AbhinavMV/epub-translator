import type { ChapterProofread, ProofreadBody } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { useProofreadRun } from "@/api/use-proofread-run";
import { ChapterRail } from "@/components/chapter-rail";
import { ProofreadMenu, type ProofreadScope } from "@/components/editor/proofread-menu";
import { ProofreadBar, ProofreadSheet } from "@/components/editor/proofread-review";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeJob } from "./fixtures";

const idle = { running: false, done: 0, total: 0, chapterId: null, error: null };
const scope: ProofreadScope = {
  chapterId: "c1",
  chapterTranslated: true,
  chapterProofread: false,
  unproofread: ["c2"],
  translated: ["c1", "c2"],
};

function menu(overrides: Partial<Parameters<typeof ProofreadMenu>[0]> = {}) {
  const onStart = vi.fn();
  const onStop = vi.fn();
  render(
    <TooltipProvider>
      <ProofreadMenu
        scope={scope}
        run={idle}
        disabledHint={null}
        modelLabel="Anthropic Claude (claude-opus-5-5)"
        onStart={onStart}
        onStop={onStop}
        {...overrides}
      />
    </TooltipProvider>,
  );
  return { onStart, onStop };
}

describe("ProofreadMenu", () => {
  it("proofreads the open chapter straight away", async () => {
    const { onStart } = menu();
    await userEvent.click(screen.getByRole("button", { name: /proofread/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Proofread this chapter" }));
    expect(onStart).toHaveBeenCalledWith(["c1"]);
  });

  it("confirms the cost before proofreading the whole book", async () => {
    const { onStart } = menu();
    await userEvent.click(screen.getByRole("button", { name: /proofread/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Whole book (2)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/claude-opus-5-5/)).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Start proofreading" }));
    expect(onStart).toHaveBeenCalledWith(["c1", "c2"]);
  });

  it("shows progress while running and stops on click", async () => {
    const { onStop } = menu({ run: { ...idle, running: true, done: 1, total: 3 } });
    await userEvent.click(screen.getByRole("button", { name: "Stop proofreading" }));
    expect(screen.getByText("Proofreading 2/3")).toBeInTheDocument();
    expect(onStop).toHaveBeenCalled();
  });

  it("is disabled with a reason when it cannot run", () => {
    menu({ disabledHint: "Translate a chapter first" });
    expect(screen.getByRole("button", { name: /proofread/i })).toBeDisabled();
  });
});

const proofread: ChapterProofread = {
  jobId: "j",
  chapterId: "c1",
  model: "claude-opus-5-5",
  createdAt: "2026-10-28T00:00:00.000Z",
  usage: { inputTokens: 1, outputTokens: 1 },
  suggestions: [
    {
      segmentId: "s1",
      kind: "accuracy",
      before: "<1>He</1> was angry.",
      after: "<1>He</1> was sulking.",
      reason: "拗ねる means sulk",
      state: "pending",
    },
    {
      segmentId: "s2",
      kind: "fluency",
      before: "Old.",
      after: "New.",
      reason: "",
      state: "outdated",
    },
  ],
};

describe("proofreading review", () => {
  it("summarises the chapter's suggestions in the bar", async () => {
    const onOpen = vi.fn();
    render(<ProofreadBar proofread={proofread} onOpen={onOpen} />);
    expect(screen.getByText("1 proofreading suggestion to review")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("shows a word diff without placeholder tags and records decisions", async () => {
    const onDecide = vi.fn();
    const onJump = vi.fn();
    render(
      <ProofreadSheet
        open
        onOpenChange={() => {}}
        proofread={proofread}
        chapterTitle="Chapter 1"
        positions={new Map([["s1", 4]])}
        busy={false}
        onDecide={onDecide}
        onDiscard={() => {}}
        onJump={onJump}
      />,
    );
    expect(screen.getByText("angry").tagName).toBe("DEL");
    expect(screen.getByText("sulking").tagName).toBe("INS");
    expect(screen.queryByText(/<1>/)).toBeNull();
    expect(screen.getByText(/paragraph changed since proofreading/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onDecide).toHaveBeenLastCalledWith({ accept: ["s1"] });
    await userEvent.click(screen.getByRole("button", { name: "Accept all (1)" }));
    expect(onDecide).toHaveBeenLastCalledWith({ accept: ["s1"] });
    await userEvent.click(screen.getByRole("button", { name: "¶ 4" }));
    expect(onJump).toHaveBeenCalledWith("s1");
  });
});

describe("ChapterRail proofreading badge", () => {
  it("shows how many suggestions wait in each chapter", () => {
    render(
      <ChapterRail
        chapters={[{ id: "c1", index: 0, title: "第一章", segmentCount: 2, charCount: 9 }]}
        job={makeJob({})}
        activeId="c1"
        onSelect={() => {}}
        pending={new Map([["c1", 3]])}
      />,
    );
    expect(screen.getByText("3 to review")).toBeInTheDocument();
  });
});

describe("useProofreadRun", () => {
  function wrapper(api: Api) {
    const client = new QueryClient();
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ApiProvider api={api}>{children}</ApiProvider>
      </QueryClientProvider>
    );
  }

  it("proofreads chapters in order and carries the names forward", async () => {
    const calls: { chapterId: string; body: ProofreadBody }[] = [];
    const api: Api = {
      ...createMockApi(),
      async proofreadChapter(jobId, chapterId, body) {
        calls.push({ chapterId, body });
        return {
          proofread: { ...proofread, jobId, chapterId, suggestions: [] },
          notes: [...(body.notes ?? []), { source: chapterId, target: chapterId.toUpperCase() }],
        };
      },
    };
    const { result } = renderHook(() => useProofreadRun("j"), { wrapper: wrapper(api) });
    await act(() => result.current.start(["c1", "c2"], { provider: "anthropic", model: "m" }));
    expect(calls.map((c) => c.chapterId)).toEqual(["c1", "c2"]);
    expect(calls[1]?.body.notes).toEqual([{ source: "c1", target: "C1" }]);
    expect(result.current.state).toMatchObject({ running: false, done: 2, error: null });
  });

  it("stops after the current chapter and reports failures", async () => {
    let release: () => void = () => {};
    const api: Api = {
      ...createMockApi(),
      proofreadChapter: (_j, _c, _b, signal) =>
        new Promise((_, reject) => {
          release = () => reject(new Error("rate limited"));
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    };
    const { result } = renderHook(() => useProofreadRun("j"), { wrapper: wrapper(api) });
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start(["c1", "c2"], { provider: "anthropic", model: "m" });
    });
    await waitFor(() => expect(result.current.state.running).toBe(true));
    act(() => release());
    await act(() => started);
    expect(result.current.state).toMatchObject({ running: false, done: 0, error: "rate limited" });
  });
});
