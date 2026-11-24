import type { ChapterProgress } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorToolbar, translateAction } from "@/components/editor/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderToolbar(
  hasTranslation: boolean,
  chapterProgress?: ChapterProgress,
  overrides: Partial<Parameters<typeof EditorToolbar>[0]> = {},
) {
  const handlers = {
    onTranslate: vi.fn(),
    onTranslateAll: vi.fn(),
    onTranslateTitles: vi.fn(),
  };
  render(
    <TooltipProvider>
      <EditorToolbar
        model={<button type="button">Model chip</button>}
        proofread={null}
        chapterProgress={chapterProgress}
        canTranslate
        noProviderHint="No provider configured"
        starting={false}
        titlesBusy={false}
        hasTranslation={hasTranslation}
        epubHref="/api/jobs/j1/export"
        bilingualEpubHref="/api/jobs/j1/export?layout=bilingual"
        txtHref="/api/jobs/j1/export.txt"
        {...handlers}
        {...overrides}
      />
    </TooltipProvider>,
  );
  return handlers;
}

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

describe("EditorToolbar export menu", () => {
  it("offers the translation EPUB, the bilingual EPUB and plain text", async () => {
    renderToolbar(true);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("menuitem", { name: /EPUB.*Translation/ })).toHaveAttribute(
      "href",
      "/api/jobs/j1/export",
    );
    expect(screen.getByRole("menuitem", { name: /EPUB.*Bilingual/ })).toHaveAttribute(
      "href",
      "/api/jobs/j1/export?layout=bilingual",
    );
    expect(screen.getByRole("menuitem", { name: /Plain text/ })).toHaveAttribute(
      "href",
      "/api/jobs/j1/export.txt",
    );
  });

  it("hands each download to the export handler when there is one", async () => {
    const onExport = vi.fn();
    renderToolbar(true, undefined, { onExport });
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Plain text/ }));
    expect(onExport).toHaveBeenCalledWith("/api/jobs/j1/export.txt");
  });

  it("is disabled until something is translated", () => {
    renderToolbar(false);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});

describe("translateAction", () => {
  it.each([
    ["nothing translated", undefined, "Translate chapter"],
    ["idle chapter", progress({}), "Translate chapter"],
    ["some passages left", progress({ status: "partial", done: 2 }), "Continue"],
    [
      "passages left and some failed",
      progress({ status: "partial", done: 1, failed: 1 }),
      "Continue",
    ],
    [
      "only failed passages left",
      progress({ status: "partial", done: 2, failed: 2 }),
      "Retry 2 failed",
    ],
    ["a chapter error", progress({ status: "failed", error: "HTTP 429" }), "Try again"],
    ["every passage done", progress({ status: "done", done: 4 }), "Translated"],
    ["only flagged passages", progress({ status: "partial", done: 3, flagged: 1 }), "Translated"],
    ["running", progress({ status: "running", done: 1 }), "Translating 1/4"],
    ["queued", progress({ status: "queued" }), "Queued"],
    ["submitted", progress({ status: "submitted" }), "Submitted"],
  ])("reads the label for %s", (_, p, label) => {
    expect(translateAction(p).label).toBe(label);
  });
});

describe("EditorToolbar translate button", () => {
  it("is disabled and says Translated when the chapter is done", () => {
    renderToolbar(true, progress({ status: "done", done: 4 }));
    expect(screen.getByRole("button", { name: "Translated" })).toBeDisabled();
  });

  it("retries only the failed passages through the chapter action", async () => {
    const { onTranslate } = renderToolbar(
      true,
      progress({ status: "partial", done: 3, failed: 1 }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry 1 failed" }));
    expect(onTranslate).toHaveBeenCalledOnce();
  });

  it("continues a partly translated chapter", () => {
    renderToolbar(true, progress({ status: "partial", done: 2 }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("tries again after a chapter error", () => {
    renderToolbar(false, progress({ status: "failed", error: "HTTP 429: rate limited" }));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("is disabled while the chapter translates", () => {
    renderToolbar(false, progress({ status: "running", done: 1 }));
    expect(screen.getByRole("button", { name: "Translating 1/4" })).toBeDisabled();
  });

  it("is disabled with the reason when no provider is set up", () => {
    renderToolbar(false, undefined, { canTranslate: false });
    expect(screen.getByRole("button", { name: "Translate chapter" })).toBeDisabled();
  });

  it("keeps All chapters and Title & contents in its menu, even once the chapter is done", async () => {
    const { onTranslateAll, onTranslateTitles } = renderToolbar(
      true,
      progress({ status: "done", done: 4 }),
    );
    await userEvent.click(screen.getByRole("button", { name: "More translate options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "All chapters" }));
    expect(onTranslateAll).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "More translate options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Title & contents" }));
    expect(onTranslateTitles).toHaveBeenCalledOnce();
  });

  it("offers This chapter in the menu only when the chapter has work left", async () => {
    const { onTranslate } = renderToolbar(true, progress({ status: "partial", done: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "More translate options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "This chapter" }));
    expect(onTranslate).toHaveBeenCalledOnce();
  });
});
