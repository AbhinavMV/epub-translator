import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EditorToolbar } from "@/components/editor/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderToolbar(hasTranslation: boolean) {
  render(
    <TooltipProvider>
      <EditorToolbar
        chapterProgress={undefined}
        busyCount={0}
        translatedChapters={1}
        totalChapters={2}
        canTranslate
        noProviderHint=""
        starting={false}
        hasPrev={false}
        hasNext
        hasTranslation={hasTranslation}
        onTranslate={() => {}}
        onTranslateAll={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onCancel={() => {}}
        epubHref="/api/jobs/j1/export"
        bilingualEpubHref="/api/jobs/j1/export?layout=bilingual"
        txtHref="/api/jobs/j1/export.txt"
      />
    </TooltipProvider>,
  );
}

describe("EditorToolbar export", () => {
  it("the main export button downloads the translation-only epub", () => {
    renderToolbar(true);
    expect(screen.getByRole("link", { name: "Export EPUB" })).toHaveAttribute(
      "href",
      "/api/jobs/j1/export",
    );
  });

  it("the dropdown offers translation only and bilingual downloads", async () => {
    renderToolbar(true);
    await userEvent.click(screen.getByRole("button", { name: "Export options" }));
    expect(await screen.findByRole("menuitem", { name: "Translation only" })).toHaveAttribute(
      "href",
      "/api/jobs/j1/export",
    );
    expect(screen.getByRole("menuitem", { name: "Bilingual" })).toHaveAttribute(
      "href",
      "/api/jobs/j1/export?layout=bilingual",
    );
  });

  it("disables both export controls until something is translated", () => {
    renderToolbar(false);
    expect(screen.queryByRole("link", { name: "Export EPUB" })).toBeNull();
    expect(screen.getByRole("button", { name: "Export options" })).toBeDisabled();
  });
});
