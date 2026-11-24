import type { BookSummary, ProjectDetail } from "@et/contracts";
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
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectPage, parseProjectTab } from "@/routes/project";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function renderAt(path: string, overrides: Partial<Api>) {
  const api = { ...createMockApi(), ...overrides };
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: "/", component: () => <p>library</p> }),
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      validateSearch: (search: Record<string, unknown>) => ({ tab: parseProjectTab(search.tab) }),
      component: ProjectPage,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId",
      component: () => <p>book page</p>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId/read/$chapterId",
      component: () => <p>reader page</p>,
    }),
  ];
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createRouter({ routeTree: root.addChildren(routes), history });
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
  return { router, history };
}

const book = (id: string, volumeNumber: number, extra: Partial<BookSummary> = {}): BookSummary => ({
  id,
  title: `魔女の旅々 ${volumeNumber}`,
  translatedTitle: null,
  author: null,
  sourceLang: "ja",
  coverUrl: null,
  chapterCount: 10,
  segmentCount: 100,
  createdAt: "2026-10-02T00:00:00.000Z",
  projectId: "p1",
  volumeNumber,
  ...extra,
});

const detail: ProjectDetail = {
  id: "p1",
  name: "魔女の旅々",
  createdAt: "2026-10-02T00:00:00.000Z",
  books: [
    book("v1", 1, { translatedPercent: 100, translatedTitle: "Wandering Witch 1" }),
    book("v2", 2, { translatedPercent: 34 }),
    book("v3", 3, { translatedPercent: 0 }),
  ],
  fullyTranslatedLang: null,
  mainLang: "fr",
};

const row = (label: string) => screen.getByRole("listitem", { name: label });

beforeEach(() => localStorage.clear());

describe("project tabs", () => {
  it("opens on Volumes and keeps the chosen tab in the URL", async () => {
    const { router } = renderAt("/projects/p1", { getProject: vi.fn(async () => detail) });
    const volumes = await screen.findByRole("tab", { name: /Volumes/ });
    expect(volumes).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("tab", { name: /Glossary/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "glossary" }));
    expect(screen.getByRole("tab", { name: /Glossary/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("list", { name: "Volumes" })).not.toBeInTheDocument();
  });

  it("goes back to the previous tab with Back", async () => {
    const { router, history } = renderAt("/projects/p1", {
      getProject: vi.fn(async () => detail),
    });
    await userEvent.click(await screen.findByRole("tab", { name: /Custom prompt/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "prompt" }));
    history.back();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Volumes/ })).toHaveAttribute("aria-selected", "true"),
    );
  });

  it("restores the tab from the URL on load", async () => {
    renderAt("/projects/p1?tab=prompt", { getProject: vi.fn(async () => detail) });
    expect(await screen.findByRole("tab", { name: /Custom prompt/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("button", { name: /^Custom prompt/ })).toBeInTheDocument();
  });

  it("falls back to Volumes for an unknown tab", () => {
    expect(parseProjectTab("nonsense")).toBeUndefined();
    expect(parseProjectTab("glossary")).toBe("glossary");
  });
});

describe("volume list", () => {
  it("shows each volume's status in the project's main language", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail) });
    await screen.findByRole("list", { name: "Volumes" });
    expect(within(row("Vol. 1")).getByText("Translated · French")).toBeInTheDocument();
    expect(within(row("Vol. 2")).getByText("34% translated")).toBeInTheDocument();
    expect(within(row("Vol. 2")).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "34");
    expect(within(row("Vol. 3")).getByText("Not started")).toBeInTheDocument();
  });

  it("opens the editor from the cover and keeps actions out of that link", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail) });
    await screen.findByRole("list", { name: "Volumes" });
    const open = within(row("Vol. 2")).getByRole("link", { name: /Vol\. 2/ });
    expect(open).toHaveAttribute("href", "/books/v2");
    expect(within(open).queryByRole("button")).toBeNull();
  });

  it("offers editor, read, volume number, move and delete in the volume menu, delete last", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail) });
    await userEvent.click(await screen.findByRole("button", { name: "Vol. 2 actions" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      "Open editor",
      "Read",
      "Change volume number",
      "Move to project…",
      "Delete volume…",
    ]);
  });

  it("reads a volume from its first chapter", async () => {
    const getBook = vi.fn(async (id: string) => ({
      ...book(id, 2),
      settings: {},
      chapters: [
        { id: "ch-contents", index: 0, title: null, segmentCount: 1, charCount: 1 },
        { id: "c1", index: 1, title: "One", segmentCount: 1, charCount: 1 },
      ],
    }));
    const { router } = renderAt("/projects/p1", {
      getProject: vi.fn(async () => detail),
      getBook: getBook as unknown as Api["getBook"],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Vol. 2 actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Read" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books/v2/read/c1"));
  });

  it("asks before deleting a volume", async () => {
    let current = detail;
    const deleteBook = vi.fn(async (id: string) => {
      current = { ...current, books: current.books.filter((b) => b.id !== id) };
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), deleteBook });
    await userEvent.click(await screen.findByRole("button", { name: "Vol. 3 actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete volume…" }));
    const dialog = screen.getByRole("dialog");
    expect(deleteBook).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deleteBook).toHaveBeenCalledWith("v3");
    await waitFor(() =>
      expect(screen.queryByRole("listitem", { name: "Vol. 3" })).not.toBeInTheDocument(),
    );
  });
});

describe("project menu", () => {
  const translated: ProjectDetail = {
    ...detail,
    books: [book("v1", 1, { translatedTitle: "Wandering Witch, Vol. 1" })],
  };

  it("holds rename, translated title, upload and delete", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => translated) });
    await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      "Rename project",
      "Use translated title",
      "Upload volume",
      "Delete project…",
    ]);
  });

  it("puts the cursor in the name field on Rename project", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => translated) });
    await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename project" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Project name" })).toHaveFocus(),
    );
  });

  it("uploads a volume into this project", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => translated) });
    await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Upload volume" }));
    expect(await screen.findByRole("dialog", { name: "Upload EPUB" })).toBeInTheDocument();
  });

  it("offers a translated title as a notice that renames the project", async () => {
    let current = translated;
    const renameProject = vi.fn(async (_id: string, name: string) => {
      current = { ...current, name };
      return { id: current.id, name, createdAt: current.createdAt };
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), renameProject });
    const notice = await screen.findByRole("region", { name: "Rename offer" });
    expect(notice).toHaveTextContent("Wandering Witch");
    await userEvent.click(within(notice).getByRole("button", { name: "Rename project" }));
    expect(renameProject).toHaveBeenCalledWith("p1", "Wandering Witch");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Rename offer" })).not.toBeInTheDocument(),
    );
  });

  it("remembers Not now for that title", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => translated) });
    const notice = await screen.findByRole("region", { name: "Rename offer" });
    await userEvent.click(within(notice).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Rename offer" })).not.toBeInTheDocument();
    expect(localStorage.getItem("et.renameOfferDismissed")).toContain("Wandering Witch");
  });
});
