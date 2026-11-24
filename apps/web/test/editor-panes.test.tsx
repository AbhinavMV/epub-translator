import type { ChapterView } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorPanes } from "@/components/editor/panes";
import { makeChapter } from "./fixtures";

function renderPanes(
  targetLang: string,
  view: ChapterView = makeChapter(),
  overrides: Partial<Parameters<typeof EditorPanes>[0]> = {},
) {
  const onRetryFailed = vi.fn();
  render(
    <EditorPanes
      view={view}
      loading={false}
      busy={false}
      sourceLang="ja"
      targetLang={targetLang}
      hasTranslation
      canRetry
      onRetryFailed={onRetryFailed}
      onClear={() => {}}
      {...overrides}
    />,
  );
  return { onRetryFailed };
}

function withFailed(count: number): ChapterView {
  const view = makeChapter();
  for (let i = 0; i < count; i++) {
    view.blocks.push({
      kind: "segment",
      id: `f${i}`,
      sourceHtml: `<p>失敗${i}</p>`,
      targetHtml: null,
      status: "failed",
      note: "The model declined to translate this passage (policy category: general_harms).",
    });
  }
  return view;
}

describe("EditorPanes", () => {
  it("marks the translation pane with the target lang and dir", () => {
    renderPanes("ar");
    const target = screen.getByText("Target one").closest("[lang]");
    expect(target).toHaveAttribute("lang", "ar");
    expect(target).toHaveAttribute("dir", "rtl");
  });

  it("shows why a passage failed, with Retry on that passage", async () => {
    const { onRetryFailed } = renderPanes("en", withFailed(1));
    expect(screen.getByText(/declined to translate this passage/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry passage" }));
    expect(onRetryFailed).toHaveBeenCalledOnce();
  });

  it("says Retry resends every failed passage when there are several", () => {
    renderPanes("en", withFailed(2));
    expect(screen.getAllByRole("button", { name: "Retry 2 failed" })).toHaveLength(2);
  });

  it("shows Retry nowhere else", () => {
    renderPanes("en");
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("disables Retry while it cannot run", () => {
    renderPanes("en", withFailed(1), { canRetry: false });
    expect(screen.getByRole("button", { name: "Retry passage" })).toBeDisabled();
  });

  it("hides the translation's Copy and Clear until something is translated", () => {
    renderPanes("en", makeChapter(), { hasTranslation: false });
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("keeps the source pane unmarked", () => {
    renderPanes("ar");
    expect(screen.getByText("原文一").closest("[lang]")).toBeNull();
  });
});
