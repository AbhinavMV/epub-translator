import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import { createMockApi } from "@/api/mock";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createDeviceStores, type DeviceStores, DeviceStoresProvider } from "@/lib/device-stores";
import { ReaderPage } from "@/routes/reader";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let stores: DeviceStores;
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo ??= () => {};
  stores = createDeviceStores(null);
});
afterEach(() => vi.unstubAllGlobals());

function renderReader(path: string) {
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: "/", component: () => <p>library</p> }),
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      component: () => <p>project</p>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId",
      component: () => <p>editor</p>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId/read/$chapterId",
      validateSearch: (s: Record<string, unknown>) => ({
        job: typeof s.job === "string" ? s.job : undefined,
      }),
      component: ReaderPage,
    }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiProvider api={createMockApi()}>
        <DeviceStoresProvider stores={stores}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </DeviceStoresProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

const NOTICE = { name: "Translation status" } as const;

describe("reader header", () => {
  it("shows the chapter as the current page, with Contents, Aa and Edit in the header", async () => {
    renderReader("/books/angel-2/read/c2");
    const header = await screen.findByRole("banner");
    const nav = within(header).getByRole("navigation", { name: "Breadcrumb" });
    expect(await within(nav).findByText("Chapter 2 (translated)")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await within(nav).findByRole("link", { name: /お隣の天使様/ })).toHaveAttribute(
      "href",
      "/projects/project-angel",
    );
    expect(within(header).getByRole("button", { name: "Contents" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Reader settings" })).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/books/angel-2?chapter=c2",
    );
    expect(screen.queryByRole("group", { name: "View mode" })).toBeNull();
  });

  it("shows the original chapter title while the chapter is untranslated", async () => {
    renderReader("/books/angel-3/read/c1");
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(await within(nav).findByText("第一章 婚約者の様子がおかしい")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("Aa sheet", () => {
  it("holds view, layout, font, size, width and theme", async () => {
    const user = userEvent.setup();
    renderReader("/books/angel-1/read/c1");
    await user.click(await screen.findByRole("button", { name: "Reader settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Reader settings" });
    for (const group of ["View", "Layout", "Font", "Width", "Theme"]) {
      expect(within(sheet).getByRole("radiogroup", { name: group })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole("slider", { name: "Font size" })).toBeInTheDocument();
    const theme = within(sheet).getByRole("radiogroup", { name: "Theme" });
    for (const name of ["Light", "Sepia", "Dark", "System"]) {
      expect(within(theme).getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  it("switches the view", async () => {
    const user = userEvent.setup();
    renderReader("/books/angel-1/read/c1");
    await screen.findAllByTestId("segment-row");
    expect(screen.queryByText(/朝の教室には/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reader settings" }));
    const sheet = await screen.findByRole("dialog", { name: "Reader settings" });
    await user.click(within(sheet).getByRole("radio", { name: "Interleaved" }));
    expect(stores.prefs.get().viewMode).toBe("interleaved");
    expect(await screen.findByText(/朝の教室には/)).toBeInTheDocument();
  });
});

describe("untranslated notice", () => {
  it("says a chapter is not translated yet and offers Translate in editor", async () => {
    renderReader("/books/angel-3/read/c1");
    const notice = await screen.findByRole("note", NOTICE);
    expect(notice).toHaveTextContent(
      "This chapter isn’t translated yet, so it shows the original Japanese.",
    );
    expect(within(notice).getByRole("link", { name: "Translate in editor" })).toHaveAttribute(
      "href",
      "/books/angel-3?chapter=c1",
    );
  });

  it("counts the translated passages of a partly translated chapter", async () => {
    renderReader("/books/angel-2-5/read/c2");
    const notice = await screen.findByRole("note", NOTICE);
    expect(notice).toHaveTextContent(
      "3 of 6 passages are translated. The rest show the original Japanese.",
    );
  });

  it("is absent on a fully translated chapter", async () => {
    renderReader("/books/angel-1/read/c1");
    await screen.findAllByTestId("segment-row");
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    await within(nav).findByText("Chapter 1 (translated)");
    expect(screen.queryByRole("note", NOTICE)).toBeNull();
  });
});

describe("pager", () => {
  it("shows the chapter position between Previous and Next", async () => {
    renderReader("/books/angel-1/read/c2");
    const pager = await screen.findByRole("navigation", { name: "Chapter navigation" });
    expect(await within(pager).findByText("2 of 3")).toBeInTheDocument();
    expect(within(pager).getByRole("button", { name: /Previous/ })).toBeEnabled();
    expect(within(pager).getByRole("button", { name: /Next/ })).toBeEnabled();
  });
});
