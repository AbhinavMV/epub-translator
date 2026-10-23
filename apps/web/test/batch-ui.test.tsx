import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChapterRail } from "@/components/chapter-rail";
import { ModeToggle } from "@/components/editor/mode-toggle";
import { EditorToolbar } from "@/components/editor/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isBusy, STATUS_LABEL } from "@/lib/chapter-status";
import { makeJob } from "./fixtures";

const submitted = {
  chapterId: "c1",
  status: "submitted" as const,
  done: 0,
  flagged: 0,
  failed: 0,
  total: 4,
  error: null,
};

describe("ModeToggle", () => {
  it("switches to batch", async () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="live" batchAvailable onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /batch/i }));
    expect(onChange).toHaveBeenCalledWith("batch");
  });

  it("disables batch when the provider does not support it", () => {
    render(<ModeToggle mode="live" batchAvailable={false} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /batch/i })).toBeDisabled();
  });

  it("marks the active mode", () => {
    render(<ModeToggle mode="batch" batchAvailable onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /batch/i })).toBeChecked();
  });
});

describe("submitted chapter state", () => {
  it("counts as busy and has a label", () => {
    expect(isBusy("submitted")).toBe(true);
    expect(STATUS_LABEL.submitted).toBe("Submitted · waiting for batch");
  });

  it("shows the label on the chapter rail", () => {
    const job = makeJob({ progress: [submitted] });
    render(
      <ChapterRail
        chapters={[{ id: "c1", index: 0, title: "One", segmentCount: 4, charCount: 10 }]}
        job={job}
        activeId="c1"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("img", { name: "Submitted · waiting for batch" })).toBeInTheDocument();
  });

  it("explains the wait in the toolbar", () => {
    render(
      <TooltipProvider>
        <EditorToolbar
          chapterProgress={submitted}
          busyCount={0}
          translatedChapters={0}
          totalChapters={2}
          canTranslate
          noProviderHint=""
          starting={false}
          titlesBusy={false}
          hasPrev={false}
          hasNext
          hasTranslation={false}
          onTranslate={() => {}}
          onTranslateAll={() => {}}
          onTranslateTitles={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onCancel={() => {}}
          epubHref={undefined}
          txtHref={undefined}
          bilingualEpubHref={undefined}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Submitted · waiting for batch");
  });
});
