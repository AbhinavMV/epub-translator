import type { ChapterProgress } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChapterStatusBlock } from "@/components/editor/chapter-status-block";

const progress = (p: Partial<ChapterProgress>): ChapterProgress => ({
  chapterId: "c1",
  status: "idle",
  done: 0,
  flagged: 0,
  failed: 0,
  total: 6,
  error: null,
  ...p,
});

function renderBlock(p: ChapterProgress | undefined, busyElsewhere = 0) {
  const onCancel = vi.fn();
  render(
    <ChapterStatusBlock
      title="Chapter 1"
      progress={p}
      segmentCount={6}
      chaptersDone={2}
      totalChapters={5}
      busyElsewhere={busyElsewhere}
      onCancel={onCancel}
    />,
  );
  return { onCancel };
}

describe("ChapterStatusBlock", () => {
  it("shows passages done in the chapter and chapters done in the volume in one block", () => {
    renderBlock(progress({ status: "partial", done: 3, failed: 1 }));
    expect(screen.getByRole("heading", { name: "Chapter 1" })).toBeInTheDocument();
    expect(screen.getByText("1 passage failed")).toBeInTheDocument();
    expect(screen.getByText("3 of 6 passages")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Passages translated" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(screen.getByText("2 of 5 chapters")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("counts every passage before anything is translated", () => {
    renderBlock(undefined);
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("0 of 6 passages")).toBeInTheDocument();
  });

  it("says when the chapter is translated", () => {
    renderBlock(progress({ status: "done", done: 6 }));
    expect(screen.getByText("Chapter translated")).toBeInTheDocument();
  });

  it("shows translation running with a way to stop the queue", async () => {
    const { onCancel } = renderBlock(progress({ status: "running", done: 2 }));
    expect(screen.getByRole("status")).toHaveTextContent("Translating 2/6 passages");
    await userEvent.click(screen.getByRole("button", { name: "Cancel translation" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows other chapters still translating", () => {
    renderBlock(progress({ status: "done", done: 6 }), 2);
    expect(screen.getByRole("status")).toHaveTextContent("Translating 2 other chapters");
  });

  it("has no status pill when nothing runs", () => {
    renderBlock(progress({ status: "partial", done: 2 }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
