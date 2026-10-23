import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorPanes } from "@/components/editor/panes";
import { makeChapter } from "./fixtures";

function renderPanes(targetLang: string) {
  render(
    <EditorPanes
      view={makeChapter()}
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

  it("keeps the source pane unmarked", () => {
    renderPanes("ar");
    expect(screen.getByText("原文一").closest("[lang]")).toBeNull();
  });
});
