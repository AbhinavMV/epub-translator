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
import { ProjectPage } from "@/routes/project";

function renderAt(path: string, overrides: Partial<Api>) {
  const api = { ...createMockApi(), ...overrides };
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: "/", component: () => <p>library</p> }),
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      component: ProjectPage,
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

const book = (id: string, title: string, volumeNumber: number): BookSummary => ({
  id,
  title,
  translatedTitle: null,
  author: null,
  sourceLang: "ja",
  coverUrl: null,
  chapterCount: 10,
  segmentCount: 100,
  createdAt: "2026-10-02T00:00:00.000Z",
  projectId: "p1",
  volumeNumber,
});

const detail = (books: BookSummary[]): ProjectDetail => ({
  id: "p1",
  name: "魔女の旅々",
  createdAt: "2026-10-02T00:00:00.000Z",
  books,
});

const threeBooks = detail([
  book("v1", "魔女の旅々 1", 1),
  book("v2", "魔女の旅々 2", 2),
  book("v3", "魔女の旅々 3", 3),
]);

const summaries: ProjectSummary[] = [
  { ...detail([]), volumeCount: 3, coverUrl: null },
  {
    id: "p2",
    name: "Wandering Witch",
    createdAt: "2026-10-01T00:00:00.000Z",
    volumeCount: 1,
    coverUrl: null,
  },
];

describe("Delete a project", () => {
  it("names the book count, deletes the project and returns to the library", async () => {
    const deleteProject = vi.fn(async () => {});
    const { router } = renderAt("/projects/p1", {
      getProject: vi.fn(async () => threeBooks),
      deleteProject,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("3 books");
    expect(deleteProject).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deleteProject).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("says when there is a single book or none", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail([book("v1", "本", 1)])) });
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1 book will");
  });

  it("offers an empty project for deletion without mentioning books to lose", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail([])) });
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("has no books");
  });

  it("cancelling keeps the project", async () => {
    const deleteProject = vi.fn(async () => {});
    renderAt("/projects/p1", { getProject: vi.fn(async () => threeBooks), deleteProject });
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deleteProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Move a book", () => {
  it("moves a volume to the chosen project", async () => {
    let current = threeBooks;
    const moveBook = vi.fn(async (bookId: string, projectId: string) => {
      const moved = current.books.find((b) => b.id === bookId);
      current = { ...current, books: current.books.filter((b) => b.id !== bookId) };
      if (!moved) throw new Error("unknown book");
      return { ...moved, projectId, volumeNumber: 2 };
    });
    renderAt("/projects/p1", {
      getProject: vi.fn(async () => current),
      listProjects: vi.fn(async () => summaries),
      moveBook,
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Move 魔女の旅々 2 to another project" }),
    );
    const dialog = screen.getByRole("dialog");
    const select = within(dialog).getByRole("combobox", { name: "Project" });
    expect(within(select).queryByRole("option", { name: "魔女の旅々" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Move" })).toBeDisabled();

    await userEvent.selectOptions(
      select,
      await within(select).findByRole("option", { name: "Wandering Witch" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(moveBook).toHaveBeenCalledWith("v2", "p2");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /魔女の旅々 2/ })).not.toBeInTheDocument(),
    );
  });
});
