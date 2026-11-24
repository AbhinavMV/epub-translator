import type { BookSummary, ProjectSummary } from "@et/contracts";
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
import { lastOpenedStore } from "@/lib/last-opened-store";
import { LibraryPage } from "@/routes/library";

beforeEach(() => lastOpenedStore.clear());

function renderLibrary(overrides: Partial<Api> = {}) {
  const api = { ...createMockApi(), ...overrides };
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: "/", component: LibraryPage }),
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      component: () => <p>project page</p>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId",
      component: () => <p>editor page</p>,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId/read/$chapterId",
      component: () => <p>reader page</p>,
    }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
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
  return { router, api };
}

const project = (overrides: Partial<ProjectSummary> & { id: string }): ProjectSummary => ({
  name: overrides.id,
  createdAt: "2026-10-02T00:00:00.000Z",
  volumeCount: 4,
  coverUrl: null,
  fullyTranslatedLang: null,
  mainLang: null,
  translatedVolumeCount: 0,
  ...overrides,
});

const book = (id: string, title: string, projectId: string): BookSummary => ({
  id,
  title,
  translatedTitle: null,
  author: null,
  sourceLang: "ja",
  coverUrl: null,
  chapterCount: 1,
  segmentCount: 1,
  createdAt: "2026-10-02T00:00:00.000Z",
  projectId,
  volumeNumber: 1,
});

const card = (name: RegExp) => screen.findByRole("link", { name });

describe("library cards", () => {
  it("shows one status line per project, with the full name on hover", async () => {
    renderLibrary({
      listProjects: vi.fn(async () => [
        project({ id: "p1", name: "Angel", mainLang: "en", translatedVolumeCount: 2 }),
        project({ id: "p2", name: "Witch", volumeCount: 2, fullyTranslatedLang: "fr" }),
        project({ id: "p3", name: "Spice", volumeCount: 1, fullyTranslatedLang: "en" }),
        project({ id: "p4", name: "Fresh", volumeCount: 3 }),
      ]),
    });
    const angel = await card(/Angel/);
    expect(within(angel).getByText("2 of 4 volumes translated")).toBeInTheDocument();
    expect(within(angel).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(within(angel).getByText("Angel")).toHaveAttribute("title", "Angel");
    expect(within(await card(/Witch/)).getByText("Fully translated · French")).toBeInTheDocument();
    expect(within(await card(/Spice/)).getByText("Fully translated")).toBeInTheDocument();
    expect(within(await card(/Fresh/)).getByText("Not started · 3 volumes")).toBeInTheDocument();
  });

  it("counts projects and volumes above the title", async () => {
    renderLibrary({
      listProjects: vi.fn(async () => [
        project({ id: "p1", volumeCount: 4 }),
        project({ id: "p2", volumeCount: 1 }),
      ]),
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(await screen.findByText("2 projects · 5 volumes")).toBeInTheDocument();
  });
});

describe("library search", () => {
  const projects = [
    project({ id: "p1", name: "Wandering Witch" }),
    project({ id: "p2", name: "Spice and Wolf" }),
  ];

  it("filters by project name and by series title", async () => {
    renderLibrary({
      listProjects: vi.fn(async () => projects),
      listBooks: vi.fn(async () => [
        book("b1", "魔女の旅々 1", "p1"),
        book("b2", "狼と香辛料 2", "p2"),
      ]),
    });
    const search = await screen.findByRole("searchbox", { name: "Search projects" });
    await card(/Wandering Witch/);

    await userEvent.type(search, "wolf");
    expect(screen.queryByRole("link", { name: /Wandering Witch/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Spice and Wolf/ })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "魔女の旅々");
    expect(await card(/Wandering Witch/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Spice and Wolf/ })).not.toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    renderLibrary({ listProjects: vi.fn(async () => projects) });
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Search projects" }),
      "nothing like it",
    );
    expect(await screen.findByText("No project matches that search.")).toBeInTheDocument();
  });
});

describe("continue where you left off", () => {
  it("is hidden until a book has been opened on this device", async () => {
    renderLibrary();
    await card(/魔女の旅々/);
    expect(screen.queryByRole("region", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("reopens the last book and chapter to read or translate", async () => {
    lastOpenedStore.record({ bookId: "witch-2", chapterId: "c2" });
    renderLibrary();
    const strip = await screen.findByRole("region", { name: "Continue" });
    expect(await within(strip).findByText("魔女の旅々")).toBeInTheDocument();
    expect(within(strip).getByRole("link", { name: "Read" })).toHaveAttribute(
      "href",
      "/books/witch-2/read/c2",
    );
    expect(within(strip).getByRole("link", { name: "Translate" })).toHaveAttribute(
      "href",
      "/books/witch-2?chapter=c2",
    );
    expect(await within(strip).findByText(/Vol\. 2 · Chapter 2/)).toBeInTheDocument();
  });

  it("forgets a book that is no longer in the library", async () => {
    lastOpenedStore.record({ bookId: "gone", chapterId: "c1" });
    renderLibrary();
    await card(/魔女の旅々/);
    await waitFor(() => expect(lastOpenedStore.get()).toBeNull());
    expect(screen.queryByRole("region", { name: "Continue" })).not.toBeInTheDocument();
  });
});

describe("empty library", () => {
  it("explains how to start and offers Upload EPUB", async () => {
    renderLibrary({ listProjects: vi.fn(async () => []) });
    expect(await screen.findByText("Your library is empty")).toBeInTheDocument();
    const main = screen.getByRole("main");
    await userEvent.click(within(main).getByRole("button", { name: "Upload EPUB" }));
    expect(await screen.findByRole("dialog", { name: "Upload EPUB" })).toBeInTheDocument();
  });
});
