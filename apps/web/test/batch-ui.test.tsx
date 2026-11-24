import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChapterRail } from "@/components/chapter-rail";
import { ChapterStatusBlock } from "@/components/editor/chapter-status-block";
import { ModeToggle } from "@/components/editor/mode-toggle";
import { BUSY_LABEL, isBusy } from "@/lib/chapter-status";
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
    expect(BUSY_LABEL.submitted).toBe("Submitted · waiting for batch");
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

  it("explains the wait in the status block and checks the batch on request", async () => {
    const onCheckBatch = vi.fn();
    render(
      <ChapterStatusBlock
        title="One"
        progress={submitted}
        segmentCount={4}
        chaptersDone={0}
        totalChapters={2}
        busyElsewhere={0}
        onCancel={() => {}}
        onCheckBatch={onCheckBatch}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Submitted · waiting for batch");
    await userEvent.click(screen.getByRole("button", { name: "Check batch" }));
    expect(onCheckBatch).toHaveBeenCalledOnce();
  });
});
