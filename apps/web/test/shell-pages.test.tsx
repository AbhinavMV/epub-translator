import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import { createMockApi } from "@/api/mock";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lastOpenedStore } from "@/lib/last-opened-store";
import { BookPage } from "@/routes/book";
import { ReaderPage } from "@/routes/reader";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  Element.prototype.scrollTo ??= () => {};
  lastOpenedStore.clear();
});
afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string) {
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
      validateSearch: (s: Record<string, unknown>) => ({
        chapter: typeof s.chapter === "string" ? s.chapter : undefined,
      }),
      component: BookPage,
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
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

async function breadcrumb() {
  const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
  await within(nav).findByRole("link", { name: /お隣の天使様/ });
  return nav;
}

describe.each([
  ["editor", "/books/angel-2?chapter=c2"],
  ["reader", "/books/angel-2/read/c2"],
])("%s shell", (_, path) => {
  it("shows Library / Project / Vol. N and Settings", async () => {
    renderAt(path);
    const nav = await breadcrumb();
    expect(within(nav).getByRole("link", { name: "Library" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: /お隣の天使様/ })).toHaveAttribute(
      "href",
      "/projects/project-angel",
    );
    expect(within(nav).getByText("Vol. 2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("records the open book and chapter for this device", async () => {
    renderAt(path);
    await waitFor(() =>
      expect(lastOpenedStore.get()).toMatchObject({ bookId: "angel-2", chapterId: "c2" }),
    );
  });
});
