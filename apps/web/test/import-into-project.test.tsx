import type {
  BookSummary,
  ImportPlacement,
  ImportPreview,
  ProjectDetail,
  ProjectSummary,
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
import { render, screen, waitFor } from "@testing-library/react";
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

const projects: ProjectSummary[] = [
  {
    id: "p1",
    name: "Wandering Witch",
    createdAt: "2026-10-02T00:00:00.000Z",
    volumeCount: 1,
    coverUrl: null,
  },
  {
    id: "p2",
    name: "Spice and Wolf",
    createdAt: "2026-10-01T00:00:00.000Z",
    volumeCount: 2,
    coverUrl: null,
  },
];

const book = (id: string, title: string, volumeNumber: number): BookSummary => ({
  id,
  title,
  translatedTitle: null,
  author: null,
  sourceLang: "ja",
  coverUrl: null,
  chapterCount: 1,
  segmentCount: 1,
  createdAt: "2026-10-02T00:00:00.000Z",
  projectId: "p1",
  volumeNumber,
});

const secondVolume: ImportPreview = {
  kind: "new",
  title: "魔女の旅々 2",
  seriesTitle: "魔女の旅々",
  volumeNumber: 2,
  project: { id: "p1", name: "Wandering Witch", createdAt: "2026-10-02T00:00:00.000Z" },
};

function importing(preview: ImportPreview) {
  const commit = vi.fn(async (_placement: ImportPlacement) => book("new", preview.kind, 1));
  const prepareImport = vi.fn(async () => ({ preview, commit }));
  return { commit, prepareImport };
}

async function drop(title = "book.epub") {
  await userEvent.upload(
    await screen.findByTestId("epub-input"),
    new File(["PK"], title, { type: "application/epub+zip" }),
  );
  return screen.findByRole("dialog");
}

describe("import confirmation", () => {
  it("suggests the existing project and the parsed volume for a later volume", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await drop();

    expect(await screen.findByRole("combobox", { name: "Project" })).toHaveValue("p1");
    expect(screen.getByRole("spinbutton", { name: "Volume number" })).toHaveValue(2);
    expect(commit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(commit).toHaveBeenCalledWith({ projectId: "p1", volumeNumber: 2 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("suggests a new project named after the series for an unrelated book", async () => {
    const { commit, prepareImport } = importing({
      kind: "new",
      title: "狼と香辛料",
      seriesTitle: "狼と香辛料",
      volumeNumber: null,
      project: null,
    });
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await drop();

    expect(await screen.findByRole("combobox", { name: "Project" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "New project name" })).toHaveValue("狼と香辛料");
    expect(screen.getByRole("spinbutton", { name: "Volume number" })).toHaveValue(null);
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(commit).toHaveBeenCalledWith({ projectName: "狼と香辛料", volumeNumber: null });
  });

  it("imports into the project and volume the reader picked", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await drop();

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "Spice and Wolf",
    );
    const volume = screen.getByRole("spinbutton", { name: "Volume number" });
    await userEvent.clear(volume);
    await userEvent.type(volume, "5.5");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(commit).toHaveBeenCalledWith({ projectId: "p2", volumeNumber: 5.5 });
  });

  it("lets the reader rename the new project and leave the volume to the unnumbered rule", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await drop();

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Project" }),
      "New project",
    );
    const name = screen.getByRole("textbox", { name: "New project name" });
    expect(name).toHaveValue("魔女の旅々");
    await userEvent.clear(name);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    await userEvent.type(name, "Side stories");
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Volume number" }));
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(commit).toHaveBeenCalledWith({ projectName: "Side stories", volumeNumber: null });
  });

  it("saves nothing when the reader cancels", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await drop();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(commit).not.toHaveBeenCalled();
  });

  it("asks nothing for a file already in the library", async () => {
    const commit = vi.fn();
    const prepareImport = vi.fn(async () => ({
      preview: { kind: "duplicate" as const, book: book("v1", "魔女の旅々 1", 1) },
      commit,
    }));
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await userEvent.upload(
      await screen.findByTestId("epub-input"),
      new File(["PK"], "book.epub", { type: "application/epub+zip" }),
    );
    await waitFor(() => expect(prepareImport).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("volume number on the project page", () => {
  it("editing a volume number reorders the project's books", async () => {
    let current: ProjectDetail = {
      id: "p1",
      name: "Wandering Witch",
      createdAt: "2026-10-02T00:00:00.000Z",
      books: [book("v1", "魔女の旅々 1", 1), book("v2", "魔女の旅々 2", 2)],
    };
    const setVolumeNumber = vi.fn(async (bookId: string, volumeNumber: number) => {
      const books = current.books
        .map((b) => (b.id === bookId ? { ...b, volumeNumber } : b))
        .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
      current = { ...current, books };
      return books.find((b) => b.id === bookId) as BookSummary;
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), setVolumeNumber });

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit volume number of 魔女の旅々 1" }),
    );
    const input = screen.getByRole("spinbutton", { name: "Volume number of 魔女の旅々 1" });
    await userEvent.clear(input);
    await userEvent.type(input, "3{Enter}");

    expect(setVolumeNumber).toHaveBeenCalledWith("v1", 3);
    await waitFor(() =>
      expect(screen.getAllByText(/^Vol\. /).map((el) => el.textContent)).toEqual([
        "Vol. 2",
        "Vol. 3",
      ]),
    );
  });

  it("cancelling the volume number edit keeps the number", async () => {
    const project: ProjectDetail = {
      id: "p1",
      name: "Wandering Witch",
      createdAt: "2026-10-02T00:00:00.000Z",
      books: [book("v1", "魔女の旅々 1", 1)],
    };
    const setVolumeNumber = vi.fn();
    renderAt("/projects/p1", { getProject: vi.fn(async () => project), setVolumeNumber });

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit volume number of 魔女の旅々 1" }),
    );
    await userEvent.type(
      screen.getByRole("spinbutton", { name: "Volume number of 魔女の旅々 1" }),
      "4",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.getByRole("button", { name: "Edit volume number of 魔女の旅々 1" }),
    ).toBeInTheDocument();
    expect(setVolumeNumber).not.toHaveBeenCalled();
  });
});
