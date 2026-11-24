import { CONTENTS_CHAPTER_ID } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChapterRail } from "@/components/chapter-rail";
import { makeJob } from "./fixtures";

const chapters = [
  { id: "c1", index: 0, title: "第一章", segmentCount: 4, charCount: 10 },
  { id: CONTENTS_CHAPTER_ID, index: -1, title: "Contents", segmentCount: 5, charCount: 20 },
];

function rail(titles: { book: string | null; chapters: Record<string, string> }) {
  render(
    <ChapterRail chapters={chapters} job={makeJob({ titles })} activeId="c1" onSelect={() => {}} />,
  );
}

describe("ChapterRail titles", () => {
  it("shows only the translated chapter title, with the original as its tooltip", () => {
    rail({ book: null, chapters: { c1: "Chapter One" } });
    expect(screen.getByText("Chapter One")).toHaveAttribute("title", "第一章");
    expect(screen.queryByText("第一章")).toBeNull();
  });

  it("shows the original title, without a tooltip, until a translation exists", () => {
    rail({ book: null, chapters: {} });
    expect(screen.getAllByText("第一章")).toHaveLength(1);
    expect(screen.getByText("第一章")).not.toHaveAttribute("title");
  });

  it("lists the generated title and navigation item first, without a chapter number", () => {
    rail({ book: null, chapters: {} });
    const items = screen.getAllByRole("button");
    expect(items[0]).toHaveTextContent("Book title & navigation");
    expect(items[0]).not.toHaveTextContent("00");
    expect(items[1]).toHaveTextContent("01");
    expect(screen.queryByText("Contents")).toBeNull();
  });
});
