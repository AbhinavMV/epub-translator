import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChapterContent } from "@/components/reader/chapter-view";
import { makeChapter } from "./fixtures";

describe("ChapterContent", () => {
  it("side-by-side renders one row per segment and static blocks span", () => {
    render(<ChapterContent view={makeChapter()} mode="side-by-side" running={false} />);
    expect(screen.getAllByTestId("segment-row")).toHaveLength(3);
    const statics = screen.getAllByTestId("static-block");
    expect(statics).toHaveLength(1);
    expect(statics[0]).toHaveAttribute("data-span", "both");
    const first = screen.getAllByTestId("segment-row")[0] as HTMLElement;
    expect(within(first).getByText("原文一")).toBeInTheDocument();
    expect(within(first).getByText("Target one")).toBeInTheDocument();
  });

  it("translation mode falls back to source for pending segments", () => {
    render(<ChapterContent view={makeChapter()} mode="translation" running />);
    expect(screen.getByText("Target one")).toBeInTheDocument();
    expect(screen.getByText("原文二").closest("[data-pending]")).not.toBeNull();
    expect(screen.queryByText("原文一")).not.toBeInTheDocument();
  });

  it("interleaved shows source above target", () => {
    render(<ChapterContent view={makeChapter()} mode="interleaved" running={false} />);
    expect(screen.getByText("原文一")).toBeInTheDocument();
    expect(screen.getByText("Target one")).toBeInTheDocument();
  });

  it("flags formatting-lossy segments", () => {
    render(<ChapterContent view={makeChapter()} mode="translation" running={false} />);
    expect(screen.getByText("Target three").closest("[data-flagged]")).not.toBeNull();
  });
});
