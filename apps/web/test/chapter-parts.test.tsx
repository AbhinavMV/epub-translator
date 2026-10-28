import type { ChapterBlock, ChapterView } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { useChapter } from "@/api/queries";
import { EditorPanes } from "@/components/editor/panes";
import { PartSentinel } from "@/components/part-sentinel";
import { PagedReader } from "@/components/reader/paged-reader";
import { shouldFetchNextPart } from "@/lib/pagination";
import { makeChapter } from "./fixtures";

class MockObserver {
  static instances: MockObserver[] = [];
  elements = new Set<Element>();
  disconnected = false;
  constructor(readonly callback: IntersectionObserverCallback) {
    MockObserver.instances.push(this);
  }
  observe(el: Element) {
    this.elements.add(el);
  }
  unobserve(el: Element) {
    this.elements.delete(el);
  }
  disconnect() {
    this.disconnected = true;
    this.elements.clear();
  }
  show(isIntersecting = true) {
    const entries = [...this.elements].map((target) => ({ isIntersecting, target }));
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

const live = () => MockObserver.instances.filter((o) => !o.disconnected && o.elements.size > 0);

beforeEach(() => {
  MockObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockObserver);
});
afterEach(() => vi.unstubAllGlobals());

describe("PartSentinel", () => {
  it("asks for the next part once it scrolls into view", () => {
    const onVisible = vi.fn();
    render(<PartSentinel hasMore loading={false} onVisible={onVisible} />);
    expect(onVisible).not.toHaveBeenCalled();
    act(() => live()[0]?.show(false));
    expect(onVisible).not.toHaveBeenCalled();
    act(() => live()[0]?.show(true));
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and observes nothing when every part is loaded", () => {
    render(<PartSentinel hasMore={false} loading={false} onVisible={() => {}} />);
    expect(screen.queryByTestId("part-sentinel")).toBeNull();
    expect(live()).toHaveLength(0);
  });

  it("does not ask again while a part is loading", () => {
    const onVisible = vi.fn();
    render(<PartSentinel hasMore loading onVisible={onVisible} />);
    expect(live()).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });
});

describe("EditorPanes parts", () => {
  const panes = (props: Partial<React.ComponentProps<typeof EditorPanes>> = {}) => (
    <EditorPanes
      view={makeChapter()}
      loading={false}
      busy={false}
      sourceLang="ja"
      targetLang="en"
      hasTranslation
      canRetry={false}
      hasMore
      loadingMore={false}
      onLoadMore={() => {}}
      onRetry={() => {}}
      onClear={() => {}}
      {...props}
    />
  );

  it("requests the next part when the end sentinel becomes visible", () => {
    const onLoadMore = vi.fn();
    render(panes({ onLoadMore }));
    expect(onLoadMore).not.toHaveBeenCalled();
    act(() => live()[0]?.show(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("has no sentinel once the whole chapter is loaded", () => {
    render(panes({ hasMore: false }));
    expect(screen.queryByTestId("part-sentinel")).toBeNull();
  });
});

function viewPart(part: number, partCount: number): ChapterView {
  const blocks: ChapterBlock[] = [0, 1].map((i) => ({
    kind: "segment",
    id: `p${part}-${i}`,
    sourceHtml: `<p>src ${part}.${i}</p>`,
    targetHtml: null,
    status: "pending",
  }));
  return { ...makeChapter(), part, partCount, blocks };
}

describe("useChapter", () => {
  function setup(partCount = 3) {
    const getChapter = vi.fn(async (_b: string, _c: string, _j: string, part = 0) =>
      viewPart(part, partCount),
    );
    const api = { getChapter } as unknown as Api;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      </ApiProvider>
    );
    return { getChapter, wrapper };
  }

  it("loads part 0, then appends further parts as one chapter on demand", async () => {
    const { getChapter, wrapper } = setup();
    const { result } = renderHook(() => useChapter("b1", "c1", "j1"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getChapter).toHaveBeenCalledTimes(1);
    expect(getChapter).toHaveBeenLastCalledWith("b1", "c1", "j1", 0);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.data?.blocks.map((b) => (b.kind === "segment" ? b.id : ""))).toEqual([
      "p0-0",
      "p0-1",
    ]);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.blocks).toHaveLength(4));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.data?.blocks).toHaveLength(6));

    expect(getChapter.mock.calls.map((c) => c[3])).toEqual([0, 1, 2]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.data?.partCount).toBe(3);
  });

  it("reports a single-part chapter as complete", async () => {
    const { wrapper } = setup(1);
    const { result } = renderHook(() => useChapter("b1", "c1", "j1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.hasMore).toBe(false);
  });
});

describe("shouldFetchNextPart", () => {
  it("fetches when the reader is within a page of the loaded end", () => {
    expect(shouldFetchNextPart({ page: 0, count: 8 }, true, false)).toBe(false);
    expect(shouldFetchNextPart({ page: 5, count: 8 }, true, false)).toBe(false);
    expect(shouldFetchNextPart({ page: 6, count: 8 }, true, false)).toBe(true);
    expect(shouldFetchNextPart({ page: 7, count: 8 }, true, false)).toBe(true);
  });

  it("fetches straight away when the loaded text fits in two pages", () => {
    expect(shouldFetchNextPart({ page: 0, count: 2 }, true, false)).toBe(true);
  });

  it("does nothing when everything is loaded or a fetch is running", () => {
    expect(shouldFetchNextPart({ page: 7, count: 8 }, false, false)).toBe(false);
    expect(shouldFetchNextPart({ page: 7, count: 8 }, true, true)).toBe(false);
  });
});

describe("PagedReader with unloaded parts", () => {
  const originals = {
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
    scrollWidth: Object.getOwnPropertyDescriptor(Element.prototype, "scrollWidth"),
  };
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 700 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(Element.prototype, "scrollWidth", {
      configurable: true,
      get: () => 644 * 3 + 48 * 2,
    });
  });
  afterEach(() => {
    for (const [k, d] of Object.entries(originals)) {
      const target = k === "scrollWidth" ? Element.prototype : HTMLElement.prototype;
      if (d) Object.defineProperty(target, k, d);
      else Reflect.deleteProperty(target, k);
    }
  });

  function reader(over: Partial<React.ComponentProps<typeof PagedReader>> = {}) {
    const onChapter = vi.fn();
    const onNeedMore = vi.fn();
    render(
      <PagedReader
        startAt="first"
        ready
        hasPrev
        hasNext
        hasMore
        maxPageWidth={1000}
        layoutKey="a"
        onChapter={onChapter}
        onNeedMore={onNeedMore}
        {...over}
      >
        <p>Hello</p>
      </PagedReader>,
    );
    return { onChapter, onNeedMore };
  }

  it("fetches the next part before the last loaded page and does not leave the chapter", () => {
    const { onChapter, onNeedMore } = reader();
    expect(onNeedMore).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Page 3 / 3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onChapter).not.toHaveBeenCalled();
  });

  it("moves on to the next chapter from the last page once every part is loaded", () => {
    const { onChapter } = reader({ hasMore: false });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onChapter).toHaveBeenCalledWith("next", "first");
  });
});
