import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { TooltipProvider } from "@/components/ui/tooltip";
import { glossarySkipStore } from "@/lib/glossary-skip-store";
import { lastOpenedStore } from "@/lib/last-opened-store";
import { BookPage } from "@/routes/book";
import { parseProjectSearch } from "@/routes/project";
import { ReaderPage } from "@/routes/reader";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Stubs the browser APIs the editor and reader need under jsdom; call once per test file. */
export function setUpRouteTests() {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
    Element.prototype.scrollTo ??= () => {};
    lastOpenedStore.clear();
    glossarySkipStore.clear();
  });
  afterEach(() => vi.unstubAllGlobals());
}

/** Renders the editor and reader routes over the seeded mock API, starting at `path`. */
export function renderAt(path: string, api: Api = createMockApi()) {
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: "/", component: () => <p>library</p> }),
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      validateSearch: parseProjectSearch,
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
      <ApiProvider api={api}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { router };
}
