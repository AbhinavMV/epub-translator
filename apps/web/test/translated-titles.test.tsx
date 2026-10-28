import { CONTENTS_CHAPTER_ID } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookTitle } from "@/components/book-title";
import { ChapterRail } from "@/components/chapter-rail";
import { EditorToolbar } from "@/components/editor/toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  it("shows the translated chapter title with the original underneath", () => {
    rail({ book: null, chapters: { c1: "Chapter One" } });
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
    expect(screen.getByText("第一章")).toBeInTheDocument();
  });

  it("shows only the source title until a translation exists", () => {
    rail({ book: null, chapters: {} });
    expect(screen.getAllByText("第一章")).toHaveLength(1);
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

describe("BookTitle", () => {
  it("shows the translated title and keeps the original visible", () => {
    render(
      <TooltipProvider>
        <BookTitle title="迷子の本" translated="A Lost Book" />
      </TooltipProvider>,
    );
    expect(screen.getByRole("heading", { name: "A Lost Book" })).toBeInTheDocument();
    expect(screen.getByText("迷子の本")).toBeInTheDocument();
  });

  it("falls back to the source title", () => {
    render(
      <TooltipProvider>
        <BookTitle title="迷子の本" translated={null} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("heading", { name: "迷子の本" })).toBeInTheDocument();
  });
});

describe("EditorToolbar title action", () => {
  it("translates the title and contents on request", async () => {
    const onTranslateTitles = vi.fn();
    render(
      <TooltipProvider>
        <EditorToolbar
          chapterProgress={undefined}
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
          onTranslateTitles={onTranslateTitles}
          onPrev={() => {}}
          onNext={() => {}}
          onCancel={() => {}}
          epubHref={undefined}
          bilingualEpubHref={undefined}
          txtHref={undefined}
        />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Translate title & contents" }));
    expect(onTranslateTitles).toHaveBeenCalledOnce();
  });
});
