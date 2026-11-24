import { CONTENTS_CHAPTER_ID } from "@et/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChapterRail } from "@/components/chapter-rail";
import { makeJob } from "./fixtures";

const chapters = [
  { id: "c1", index: 0, title: "第一章", segmentCount: 4, charCount: 1234 },
  { id: "c2", index: 1, title: "第二章", segmentCount: 4, charCount: 2000 },
  { id: "c3", index: 2, title: "第三章", segmentCount: 4, charCount: 3000 },
  { id: "c4", index: 3, title: "第四章", segmentCount: 4, charCount: 4000 },
  { id: CONTENTS_CHAPTER_ID, index: -1, title: "Contents", segmentCount: 2, charCount: 20 },
];

const job = makeJob({
  progress: [
    { chapterId: "c1", status: "done", done: 4, flagged: 0, failed: 0, total: 4, error: null },
    { chapterId: "c2", status: "partial", done: 1, flagged: 0, failed: 0, total: 4, error: null },
    { chapterId: "c3", status: "partial", done: 2, flagged: 0, failed: 1, total: 4, error: null },
  ],
});

function chapterButton(name: RegExp) {
  return screen.getByRole("button", { name });
}

describe("ChapterRail status", () => {
  it("names each chapter's status instead of counting characters", () => {
    render(<ChapterRail chapters={chapters} job={job} activeId="c1" onSelect={() => {}} />);
    const status = (title: RegExp) =>
      within(chapterButton(title)).getByRole("img").getAttribute("aria-label");
    expect(status(/第一章/)).toBe("Translated");
    expect(status(/第二章/)).toBe("Partly translated");
    expect(status(/第三章/)).toBe("Has failed passages");
    expect(status(/第四章/)).toBe("Not started");
    expect(screen.queryByText(/chars/)).toBeNull();
  });

  it("shows passage counts in the rail", () => {
    render(<ChapterRail chapters={chapters} job={job} activeId="c1" onSelect={() => {}} />);
    expect(within(chapterButton(/第二章/)).getByText("1/4 passages")).toBeInTheDocument();
    expect(within(chapterButton(/第三章/)).getByText("2/4 · 1 failed")).toBeInTheDocument();
    expect(within(chapterButton(/第四章/)).getByText("4 passages")).toBeInTheDocument();
  });

  it("shows only titles and status in the compact list", () => {
    render(<ChapterRail chapters={chapters} job={job} activeId="c1" onSelect={() => {}} compact />);
    expect(screen.queryByText("1/4 passages")).toBeNull();
    expect(within(chapterButton(/第二章/)).getByRole("img")).toHaveAccessibleName(
      "Partly translated",
    );
  });

  it("marks an original title with the source language", () => {
    render(
      <ChapterRail
        chapters={chapters}
        job={job}
        activeId="c1"
        onSelect={() => {}}
        sourceLang="ja"
      />,
    );
    expect(screen.getByText("第四章")).toHaveAttribute("lang", "ja");
  });

  it("puts Book title & navigation first", () => {
    render(<ChapterRail chapters={chapters} job={job} activeId="c1" onSelect={() => {}} />);
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Book title & navigation");
  });
});
