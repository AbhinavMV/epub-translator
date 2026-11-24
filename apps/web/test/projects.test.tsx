import {
  type BookSummary,
  type ProjectDetail,
  ProjectDetailSchema,
  type ProjectSummary,
  ProjectSummarySchema,
} from "@et/contracts";
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
    fullyTranslatedLang: null,
    mainLang: null,
    translatedVolumeCount: 0,
  },
  {
    id: "p2",
    name: "Empty project",
    createdAt: "2026-10-01T00:00:00.000Z",
    volumeCount: 0,
    coverUrl: null,
    fullyTranslatedLang: null,
    mainLang: null,
    translatedVolumeCount: 0,
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
  fullyTranslatedLang: null,
  mainLang: null,
};

async function projectAction(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

async function projectActions() {
  await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
  const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");
  await userEvent.keyboard("{Escape}");
  return items.map((i) => i.textContent?.trim());
}

describe("Library", () => {
  it("lists projects with the cover of volume 1 and their status", async () => {
    renderAt("/", { listProjects: vi.fn(async () => summaries) });
    const card = await screen.findByRole("link", { name: /魔女の旅々/ });
    expect(within(card).getByText("Not started · 3 volumes")).toBeInTheDocument();
    expect(card.querySelector("img")?.getAttribute("src")).toBe("/api/books/v1/cover");
    expect(screen.getByRole("link", { name: /Empty project/ })).toHaveTextContent("No volumes");
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

  it("badges the header when the project is fully translated", async () => {
    renderAt("/projects/p1", {
      getProject: vi.fn(async () => ({ ...detail, fullyTranslatedLang: "pt-BR" })),
    });
    const header = (await screen.findByRole("heading", { level: 1 })).closest("header");
    expect(
      within(header as HTMLElement).getByText("Fully translated · Brazilian Portuguese"),
    ).toBeInTheDocument();
  });

  it("shows no header badge while a volume is incomplete", async () => {
    renderAt("/projects/p1", {
      getProject: vi.fn(async () => ({ ...detail, fullyTranslatedLang: null })),
    });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/^Fully translated/)).not.toBeInTheDocument();
  });

  it("shows only the translated title on a volume card", async () => {
    renderAt("/projects/p1", {
      getProject: vi.fn(async () => ({
        ...detail,
        books: [{ ...book("v1", "魔女の旅々", 1), translatedTitle: "Wandering Witch" }],
      })),
    });
    const link = await screen.findByRole("link", { name: /Wandering Witch/ });
    expect(within(link).queryByText("魔女の旅々")).not.toBeInTheDocument();
  });

  it("renames the project", async () => {
    let current = detail;
    const renameProject = vi.fn(async (_id: string, name: string) => {
      current = { ...current, name };
      return { id: current.id, name, createdAt: current.createdAt };
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), renameProject });
    await projectAction("Rename project");
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
    await projectAction("Rename project");
    await userEvent.clear(screen.getByRole("textbox", { name: "Project name" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(renameProject).not.toHaveBeenCalled();
  });
});

describe("Use translated title", () => {
  const translated = (
    id: string,
    volumeNumber: number,
    translatedTitle: string | null,
  ): BookSummary => ({ ...book(id, `魔女の旅々 ${volumeNumber}`, volumeNumber), translatedTitle });

  const withBooks = (books: BookSummary[], name = "魔女の旅々"): ProjectDetail => ({
    ...detail,
    name,
    books,
  });

  it("is not offered when no volume has a translated title", async () => {
    renderAt("/projects/p1", { getProject: vi.fn(async () => detail) });
    await screen.findByRole("heading", { level: 1, name: "魔女の旅々" });
    expect(await projectActions()).not.toContain("Use translated title");
  });

  it("is not offered when the translated title already is the name", async () => {
    const project = withBooks([translated("v3", 3, "Some Series, Vol. 3")], "Some Series");
    renderAt("/projects/p1", { getProject: vi.fn(async () => project) });
    await screen.findByRole("heading", { level: 1, name: "Some Series" });
    expect(await projectActions()).not.toContain("Use translated title");
    expect(screen.queryByRole("region", { name: "Rename offer" })).toBeNull();
  });

  it("pre-fills the rename field without the volume marker and saves only on save", async () => {
    let current = withBooks([translated("v3", 3, "Some Series, Vol. 3")]);
    const renameProject = vi.fn(async (_id: string, name: string) => {
      current = { ...current, name };
      return { id: current.id, name, createdAt: current.createdAt };
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), renameProject });

    await projectAction("Use translated title");
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("Some Series");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { level: 1, name: "魔女の旅々" })).toBeInTheDocument();
    expect(renameProject).not.toHaveBeenCalled();

    await projectAction("Use translated title");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(renameProject).toHaveBeenCalledWith("p1", "Some Series");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Some Series" }),
    ).toBeInTheDocument();
    expect(await projectActions()).not.toContain("Use translated title");
  });

  it("takes the title of the lowest-numbered translated volume", async () => {
    const project = withBooks([
      translated("v1", 1, null),
      translated("v4", 4, "Wandering Witch Vol. 4"),
      translated("v2", 2, "The Journey of Elaina 2"),
    ]);
    renderAt("/projects/p1", { getProject: vi.fn(async () => project) });
    await projectAction("Use translated title");
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue(
      "The Journey of Elaina",
    );
  });
});

describe("mock api", () => {
  it("serves projects with a main language and progress the contracts accept", async () => {
    const api = createMockApi();
    const list = ProjectSummarySchema.array().parse(await api.listProjects());
    for (const summary of list) {
      expect(summary.translatedVolumeCount).toBeLessThanOrEqual(summary.volumeCount);
      const detail = ProjectDetailSchema.parse(await api.getProject(summary.id));
      expect(detail.mainLang).toBe(summary.mainLang);
      for (const b of detail.books) {
        expect(b.translatedPercent === null).toBe(detail.mainLang === null);
      }
    }
  });
});
