import type { BookSummary, ProjectDetail, ProjectSummary } from "@et/contracts";
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
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LibraryPage } from "@/routes/library";
import { ProjectPage } from "@/routes/project";

function renderAt(path: string, overrides: Partial<Api>) {
  const api = { ...createMockApi(), ...overrides };
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: "/", component: LibraryPage }),
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      component: ProjectPage,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/books/$bookId",
      component: () => <p>book page</p>,
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
  return { router, api };
}

const summaries: ProjectSummary[] = [
  {
    id: "p1",
    name: "魔女の旅々",
    createdAt: "2026-10-02T00:00:00.000Z",
    volumeCount: 3,
    coverUrl: "/api/books/v1/cover",
  },
  {
    id: "p2",
    name: "Empty project",
    createdAt: "2026-10-01T00:00:00.000Z",
    volumeCount: 0,
    coverUrl: null,
  },
];

const book = (id: string, title: string, volumeNumber: number): BookSummary => ({
  id,
  title,
  translatedTitle: null,
  author: "白石定規",
  sourceLang: "ja",
  coverUrl: null,
  chapterCount: 10,
  segmentCount: 100,
  createdAt: "2026-10-02T00:00:00.000Z",
  projectId: "p1",
  volumeNumber,
});

const detail: ProjectDetail = {
  id: "p1",
  name: "魔女の旅々",
  createdAt: "2026-10-02T00:00:00.000Z",
  books: [
    book("v1", "魔女の旅々", 1),
    book("v2", "魔女の旅々 2", 2),
    book("v25", "魔女の旅々 2.5", 2.5),
  ],
};

describe("Library", () => {
  it("lists projects with the cover of volume 1 and the volume count", async () => {
    renderAt("/", { listProjects: vi.fn(async () => summaries) });
    const card = await screen.findByRole("link", { name: /魔女の旅々/ });
    expect(within(card).getByText("3 volumes")).toBeInTheDocument();
    expect(card.querySelector("img")?.getAttribute("src")).toBe("/api/books/v1/cover");
    expect(screen.getByRole("link", { name: /Empty project/ })).toHaveTextContent("0 volumes");
    expect(screen.getByText(/Library · 2/)).toBeInTheDocument();
  });

  it("opens a project from its card", async () => {
    const { router } = renderAt("/", {
      listProjects: vi.fn(async () => summaries),
      getProject: vi.fn(async () => detail),
    });
    await userEvent.click(await screen.findByRole("link", { name: /魔女の旅々/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1"));
  });
});

describe("Project page", () => {
  it("lists the project's books in volume order", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail) });
    expect(
      await screen.findByRole("heading", { level: 1, name: "魔女の旅々" }),
    ).toBeInTheDocument();
    const volumes = screen.getAllByText(/^Vol\. /).map((el) => el.textContent);
    expect(volumes).toEqual(["Vol. 1", "Vol. 2", "Vol. 2.5"]);
    expect(screen.getByRole("link", { name: /魔女の旅々 2\.5/ })).toHaveAttribute(
      "href",
      "/books/v25",
    );
  });

  it("renames the project", async () => {
    let current = detail;
    const renameProject = vi.fn(async (_id: string, name: string) => {
      current = { ...current, name };
      return { id: current.id, name, createdAt: current.createdAt };
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), renameProject });
    await userEvent.click(await screen.findByRole("button", { name: "Rename project" }));
    const input = screen.getByRole("textbox", { name: "Project name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Wandering Witch{Enter}");
    expect(renameProject).toHaveBeenCalledWith("p1", "Wandering Witch");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Wandering Witch" }),
    ).toBeInTheDocument();
  });

  it("does not save a blank name", async () => {
    const renameProject = vi.fn();
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail), renameProject });
    await userEvent.click(await screen.findByRole("button", { name: "Rename project" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Project name" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(renameProject).not.toHaveBeenCalled();
  });
});
