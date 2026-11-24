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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createDeviceStores, DeviceStoresProvider } from "@/lib/device-stores";
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
          <DeviceStoresProvider stores={createDeviceStores(null)}>
            <RouterProvider router={router} />
          </DeviceStoresProvider>
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
    fullyTranslatedLang: null,
    mainLang: null,
    translatedVolumeCount: 0,
  },
  {
    id: "p2",
    name: "Spice and Wolf",
    createdAt: "2026-10-01T00:00:00.000Z",
    volumeCount: 2,
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

const epub = (name = "book.epub") => new File(["PK"], name, { type: "application/epub+zip" });

async function chooseFile(name?: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Upload EPUB" }));
  const dialog = await screen.findByRole("dialog", { name: "Upload EPUB" });
  await userEvent.upload(within(dialog).getByLabelText("EPUB file"), epub(name));
  return dialog;
}

describe("upload", () => {
  it("starts by choosing a file, then suggests the project and volume from the title", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await userEvent.click(await screen.findByRole("button", { name: "Upload EPUB" }));
    const dialog = await screen.findByRole("dialog", { name: "Upload EPUB" });
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.upload(within(dialog).getByLabelText("EPUB file"), epub());

    expect(await screen.findByRole("combobox", { name: "Add to project" })).toHaveValue("p1");
    expect(screen.getByRole("spinbutton", { name: "Volume number" })).toHaveValue(2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("adds the volume and lands on the project it went into", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    const { router } = renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await chooseFile();
    await userEvent.click(await screen.findByRole("button", { name: "Add volume" }));

    expect(commit).toHaveBeenCalledWith({ projectId: "p1", volumeNumber: 2 });
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    await chooseFile();

    expect(await screen.findByRole("combobox", { name: "Add to project" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "New project name" })).toHaveValue("狼と香辛料");
    expect(screen.getByRole("spinbutton", { name: "Volume number" })).toHaveValue(null);
    await userEvent.click(screen.getByRole("button", { name: "Add volume" }));

    expect(commit).toHaveBeenCalledWith({ projectName: "狼と香辛料", volumeNumber: null });
  });

  it("uploads into the project and volume the reader picked", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await chooseFile();

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Add to project" }),
      "Spice and Wolf",
    );
    const volume = screen.getByRole("spinbutton", { name: "Volume number" });
    await userEvent.clear(volume);
    await userEvent.type(volume, "5.5");
    await userEvent.click(screen.getByRole("button", { name: "Add volume" }));

    expect(commit).toHaveBeenCalledWith({ projectId: "p2", volumeNumber: 5.5 });
  });

  it("lets the reader rename the new project and leave the volume to the unnumbered rule", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await chooseFile();

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Add to project" }),
      "New project",
    );
    const name = screen.getByRole("textbox", { name: "New project name" });
    expect(name).toHaveValue("魔女の旅々");
    await userEvent.clear(name);
    expect(screen.getByRole("button", { name: "Add volume" })).toBeDisabled();
    await userEvent.type(name, "Side stories");
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Volume number" }));
    await userEvent.click(screen.getByRole("button", { name: "Add volume" }));

    expect(commit).toHaveBeenCalledWith({ projectName: "Side stories", volumeNumber: null });
  });

  it("goes back to choosing a file with Change", async () => {
    const { prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await chooseFile("魔女の旅々 2.epub");
    expect(await screen.findByText("魔女の旅々 2.epub")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByLabelText("EPUB file")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("saves nothing when the reader cancels", async () => {
    const { commit, prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await chooseFile();
    await screen.findByRole("combobox", { name: "Add to project" });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(commit).not.toHaveBeenCalled();
  });

  it("says when the file is already in the library and adds nothing", async () => {
    const commit = vi.fn();
    const prepareImport = vi.fn(async () => ({
      preview: { kind: "duplicate" as const, book: book("v1", "魔女の旅々 1", 1) },
      commit,
    }));
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    const dialog = await chooseFile();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "“魔女の旅々 1” is already in your library",
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects a file that is not an EPUB", async () => {
    const { prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await userEvent.click(await screen.findByRole("button", { name: "Upload EPUB" }));
    const dialog = await screen.findByRole("dialog", { name: "Upload EPUB" });
    await userEvent
      .setup({ applyAccept: false })
      .upload(
        within(dialog).getByLabelText("EPUB file"),
        new File(["x"], "notes.txt", { type: "text/plain" }),
      );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/\.epub/);
    expect(prepareImport).not.toHaveBeenCalled();
  });

  it("takes a file dropped on the dialog", async () => {
    const { prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await userEvent.click(await screen.findByRole("button", { name: "Upload EPUB" }));
    const dialog = await screen.findByRole("dialog", { name: "Upload EPUB" });
    fireEvent.drop(within(dialog).getByTestId("upload-picker"), {
      dataTransfer: { files: [epub()], types: ["Files"] },
    });
    expect(await screen.findByRole("combobox", { name: "Add to project" })).toHaveValue("p1");
    expect(prepareImport).toHaveBeenCalledTimes(1);
  });

  it("opens with the file dropped anywhere on the library", async () => {
    const { prepareImport } = importing(secondVolume);
    renderAt("/", { listProjects: vi.fn(async () => projects), prepareImport });
    await screen.findByRole("link", { name: /Wandering Witch/ });
    fireEvent.drop(screen.getByRole("main"), {
      dataTransfer: { files: [epub()], types: ["Files"] },
    });
    expect(await screen.findByRole("dialog", { name: "Upload EPUB" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Add to project" })).toHaveValue("p1");
    expect(prepareImport).toHaveBeenCalledTimes(1);
  });

  it("adds a volume dropped on a project page to that project", async () => {
    const { commit, prepareImport } = importing({ ...secondVolume, project: null });
    const detail: ProjectDetail = {
      id: "p2",
      name: "Spice and Wolf",
      createdAt: "2026-10-01T00:00:00.000Z",
      books: [],
      fullyTranslatedLang: null,
      mainLang: null,
    };
    renderAt("/projects/p2", {
      listProjects: vi.fn(async () => projects),
      getProject: vi.fn(async () => detail),
      prepareImport,
    });
    await screen.findByRole("heading", { level: 1, name: "Spice and Wolf" });
    fireEvent.drop(screen.getByRole("main"), {
      dataTransfer: { files: [epub()], types: ["Files"] },
    });
    expect(await screen.findByRole("combobox", { name: "Add to project" })).toHaveValue("p2");
    await userEvent.click(screen.getByRole("button", { name: "Add volume" }));
    expect(commit).toHaveBeenCalledWith({ projectId: "p2", volumeNumber: 2 });
  });
});

describe("volume number on the project page", () => {
  it("editing a volume number reorders the project's books", async () => {
    let current: ProjectDetail = {
      id: "p1",
      name: "Wandering Witch",
      createdAt: "2026-10-02T00:00:00.000Z",
      books: [book("v1", "魔女の旅々 1", 1), book("v2", "魔女の旅々 2", 2)],
      fullyTranslatedLang: null,
      mainLang: null,
    };
    const setVolumeNumber = vi.fn(async (bookId: string, volumeNumber: number) => {
      const books = current.books
        .map((b) => (b.id === bookId ? { ...b, volumeNumber } : b))
        .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
      current = { ...current, books };
      return books.find((b) => b.id === bookId) as BookSummary;
    });
    renderAt("/projects/p1", { getProject: vi.fn(async () => current), setVolumeNumber });

    await userEvent.click(await screen.findByRole("button", { name: "Vol. 1 actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change volume number" }));
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
      fullyTranslatedLang: null,
      mainLang: null,
    };
    const setVolumeNumber = vi.fn();
    renderAt("/projects/p1", { getProject: vi.fn(async () => project), setVolumeNumber });

    await userEvent.click(await screen.findByRole("button", { name: "Vol. 1 actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change volume number" }));
    await userEvent.type(
      screen.getByRole("spinbutton", { name: "Volume number of 魔女の旅々 1" }),
      "4",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Vol. 1")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(setVolumeNumber).not.toHaveBeenCalled();
  });
});
