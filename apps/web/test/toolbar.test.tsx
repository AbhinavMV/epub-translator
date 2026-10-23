import type { ChapterProgress } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EditorToolbar } from "@/components/editor/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderToolbar(hasTranslation: boolean, chapterProgress?: ChapterProgress) {
  render(
    <TooltipProvider>
      <EditorToolbar
        chapterProgress={chapterProgress}
        busyCount={0}
        translatedChapters={1}
        totalChapters={2}
        canTranslate
        noProviderHint=""
        starting={false}
        titlesBusy={false}
        hasPrev={false}
        hasNext
        hasTranslation={hasTranslation}
        onTranslate={() => {}}
        onTranslateAll={() => {}}
        onTranslateTitles={() => {}}
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

const progress = (p: Partial<ChapterProgress>): ChapterProgress => ({
  chapterId: "c1",
  status: "idle",
  done: 0,
  flagged: 0,
  failed: 0,
  total: 4,
  error: null,
  ...p,
});

describe("EditorToolbar translate button", () => {
  it("is disabled and says Translated when the chapter is done", () => {
    renderToolbar(true, progress({ status: "done", done: 4 }));
    expect(screen.getByRole("button", { name: /translated/i })).toBeDisabled();
  });

  it("offers to retry only the failed passages", () => {
    renderToolbar(true, progress({ status: "partial", done: 3, failed: 1 }));
    expect(screen.getByRole("button", { name: /retry 1 failed/i })).toBeEnabled();
  });

  it("offers to continue a partly translated chapter", () => {
    renderToolbar(true, progress({ status: "partial", done: 2 }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("offers to try again after a chapter error", () => {
    renderToolbar(false, progress({ status: "failed", error: "HTTP 429: rate limited" }));
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });
});
