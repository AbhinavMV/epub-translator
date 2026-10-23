import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorPanes } from "@/components/editor/panes";
import { makeChapter } from "./fixtures";

function renderPanes(targetLang: string, view = makeChapter()) {
  render(
    <EditorPanes
      view={view}
      loading={false}
      busy={false}
      sourceLang="ja"
      targetLang={targetLang}
      hasTranslation
      canRetry={false}
      onRetry={() => {}}
      onClear={() => {}}
    />,
  );
}

describe("EditorPanes", () => {
  it("marks the translation pane with the target lang and dir", () => {
    renderPanes("ar");
    const target = screen.getByText("Target one").closest("[lang]");
    expect(target).toHaveAttribute("lang", "ar");
    expect(target).toHaveAttribute("dir", "rtl");
  });

  it("explains why a passage failed and how to retry it", () => {
    const view = makeChapter();
    view.blocks.push({
      kind: "segment",
      id: "s9",
      sourceHtml: "<p>原文九</p>",
      targetHtml: null,
      status: "failed",
      note: "The model declined to translate this passage (policy category: general_harms).",
    });
    renderPanes("en", view);
    expect(screen.getByText(/declined to translate this passage/)).toBeInTheDocument();
    expect(screen.getByText(/translate chapter again to retry/i)).toBeInTheDocument();
  });

  it("keeps the source pane unmarked", () => {
    renderPanes("ar");
    expect(screen.getByText("原文一").closest("[lang]")).toBeNull();
  });
});
