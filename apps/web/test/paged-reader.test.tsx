import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagedReader } from "@/components/reader/paged-reader";

const originals = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  scrollWidth: Object.getOwnPropertyDescriptor(Element.prototype, "scrollWidth"),
};

function mockLayout(pages: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 700 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
  Object.defineProperty(Element.prototype, "scrollWidth", {
    configurable: true,
    get: () => 644 * pages + 48 * (pages - 1),
  });
}

function setup(over: Partial<React.ComponentProps<typeof PagedReader>> = {}) {
  const onChapter = vi.fn();
  const utils = render(
    <PagedReader
      startAt="first"
      ready
      hasPrev
      hasNext
      maxPageWidth={1000}
      layoutKey="a"
      onChapter={onChapter}
      {...over}
    >
      <p>Hello</p>
    </PagedReader>,
  );
  return { onChapter, ...utils };
}

beforeEach(() => mockLayout(3));
afterEach(() => {
  for (const [k, d] of Object.entries(originals)) {
    const target = k === "scrollWidth" ? Element.prototype : HTMLElement.prototype;
    if (d) Object.defineProperty(target, k, d);
    else Reflect.deleteProperty(target, k);
  }
});

describe("PagedReader", () => {
  it("shows the page indicator and steps with the arrow keys", () => {
    setup();
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Page 2 / 3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "PageUp" });
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
  });

  it("asks for the next chapter from the last page", () => {
    const { onChapter } = setup();
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: " " });
    expect(onChapter).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: " " });
    expect(onChapter).toHaveBeenCalledWith("next", "first");
  });

  it("asks for the previous chapter's last page from the first page", () => {
    const { onChapter } = setup();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onChapter).toHaveBeenCalledWith("prev", "last");
  });

  it("starts on the last page when arriving from the next chapter", () => {
    setup({ startAt: "last" });
    expect(screen.getByText("Page 3 / 3")).toBeInTheDocument();
  });

  it("turns pages with tap zones but not the middle", () => {
    setup();
    const region = screen.getByRole("region", { name: "Chapter text" });
    region.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
    fireEvent.click(region, { clientX: 500 });
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
    fireEvent.click(region, { clientX: 900 });
    expect(screen.getByText("Page 2 / 3")).toBeInTheDocument();
    fireEvent.click(region, { clientX: 100 });
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
  });

  it("turns pages on swipe", () => {
    setup();
    const region = screen.getByRole("region", { name: "Chapter text" });
    fireEvent.touchStart(region, { changedTouches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 100, clientY: 110 }] });
    expect(screen.getByText("Page 2 / 3")).toBeInTheDocument();
  });

  it("does not hijack keys typed into inputs", () => {
    setup();
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
    input.remove();
  });

  it("reports the position to the parent", () => {
    const onPosition = vi.fn();
    setup({ onPosition });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onPosition).toHaveBeenLastCalledWith({ page: 1, count: 3 });
  });

  it("keeps the reader on the same content when the page count changes", () => {
    const { rerender, onChapter } = setup({ children: undefined });
    const blocks = [0, 692, 1384].map((left, i) => {
      const el = document.createElement("div");
      el.setAttribute("data-testid", "segment-row");
      Object.defineProperty(el, "offsetLeft", { configurable: true, value: left, writable: true });
      el.textContent = `b${i}`;
      return el;
    });
    const columns = screen.getByTestId("paged-columns");
    columns.append(...blocks);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Page 2 / 3")).toBeInTheDocument();

    mockLayout(6);
    Object.defineProperty(blocks[1], "offsetLeft", { value: 2076 });
    rerender(
      <PagedReader
        startAt="first"
        ready
        hasPrev
        hasNext
        maxPageWidth={1000}
        layoutKey="b"
        onChapter={onChapter}
      />,
    );
    expect(screen.getByText("Page 4 / 6")).toBeInTheDocument();
  });
});
