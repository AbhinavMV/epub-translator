import {
  type BookSummary,
  type GlossaryEntry,
  MAX_GLOSSARY_ENTRIES,
  type ProjectDetail,
  type ProjectSettings,
  type ProjectTerms,
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
import { Toaster, toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { GlossaryEditor } from "@/components/project/glossary-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectPage } from "@/routes/project";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const book = (id: string, volumeNumber: number): BookSummary => ({
  id,
  title: `魔女の旅々 ${volumeNumber}`,
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

const detail: ProjectDetail = {
  id: "p1",
  name: "魔女の旅々",
  createdAt: "2026-10-02T00:00:00.000Z",
  books: [book("v1", 1), book("v2", 2)],
  fullyTranslatedLang: null,
  mainLang: null,
};

const stored: ProjectSettings = {
  customPrompt: "Keep honorifics.",
  glossary: [
    { source: "イレイナ", target: "Elaina" },
    { source: "灰の魔女", target: "Ashen Witch" },
  ],
  glossaryConflicts: [
    {
      source: "灰の魔女",
      inForce: { target: "Ashen Witch", bookId: "v2", volumeNumber: 2 },
      alternatives: [{ target: "Witch of Ashes", note: "older", bookId: "v1", volumeNumber: 1 }],
    },
  ],
};

function renderTab(overrides: Partial<Api> = {}) {
  const saveProjectTerms = vi.fn(async (_id: string, t: ProjectTerms) => ({
    ...stored,
    ...t,
    glossaryConflicts: [],
  }));
  const resolveGlossaryConflict = vi.fn(async () => ({ ...stored, glossaryConflicts: [] }));
  const api = {
    ...createMockApi(),
    getProject: vi.fn(async () => detail),
    getProjectSettings: vi.fn(async () => stored),
    saveProjectTerms,
    resolveGlossaryConflict,
    ...overrides,
  };
  const root = createRootRoute({ component: Outlet });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/projects/$projectId",
        component: ProjectPage,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/projects/p1?tab=glossary"] }),
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
  return { api, router };
}

const conflictBox = () => screen.findByRole("region", { name: "1 glossary conflict to settle" });
const saveBar = () => screen.queryByRole("region", { name: "Unsaved glossary changes" });

describe("glossary conflicts", () => {
  it("lists each rendering with its volume and which one is in force", async () => {
    renderTab();
    const box = await conflictBox();
    const inForce = within(box).getByRole("button", { name: /“Ashen Witch”/ });
    expect(inForce).toHaveAccessibleName(/Used in Vol\. 2 · in force now/);
    expect(within(box).getByRole("button", { name: /“Witch of Ashes”/ })).toHaveAccessibleName(
      /Used in Vol\. 1 · older/,
    );
    expect(
      within(box).getByRole("button", { name: /Write a different rendering/ }),
    ).toBeInTheDocument();
  });

  it("settling a conflict updates the entry and only takes effect on Save glossary", async () => {
    const { api } = renderTab();
    const box = await conflictBox();
    expect(saveBar()).toBeNull();
    await userEvent.click(within(box).getByRole("button", { name: /“Witch of Ashes”/ }));

    expect(api.resolveGlossaryConflict).not.toHaveBeenCalled();
    expect(api.saveProjectTerms).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: /conflict to settle/ })).toBeNull();
    expect(screen.getByDisplayValue("Witch of Ashes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("older")).toBeInTheDocument();

    await userEvent.click(
      within(saveBar() as HTMLElement).getByRole("button", { name: "Save glossary" }),
    );
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Keep honorifics.",
      glossary: [
        { source: "イレイナ", target: "Elaina" },
        { source: "灰の魔女", target: "Witch of Ashes", note: "older" },
      ],
    });
    expect(api.resolveGlossaryConflict).not.toHaveBeenCalled();
    await waitFor(() => expect(saveBar()).toBeNull());
  });

  it("keeping the rendering in force resolves the conflict when the glossary is saved", async () => {
    const { api } = renderTab();
    const box = await conflictBox();
    await userEvent.click(within(box).getByRole("button", { name: /“Ashen Witch”/ }));
    expect(api.resolveGlossaryConflict).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save glossary" }));

    await waitFor(() =>
      expect(api.resolveGlossaryConflict).toHaveBeenCalledWith("p1", {
        source: "灰の魔女",
        target: "Ashen Witch",
      }),
    );
    await waitFor(() => expect(api.saveProjectTerms).toHaveBeenCalled());
  });

  it("writing a different rendering focuses the entry's rendering", async () => {
    renderTab();
    const box = await conflictBox();
    await userEvent.click(within(box).getByRole("button", { name: /Write a different rendering/ }));
    expect(screen.getByDisplayValue("Ashen Witch")).toHaveFocus();
    expect(saveBar()).not.toBeNull();
  });

  it("Discard brings the conflict and the old rendering back", async () => {
    renderTab();
    const box = await conflictBox();
    await userEvent.click(within(box).getByRole("button", { name: /“Witch of Ashes”/ }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(await conflictBox()).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ashen Witch")).toBeInTheDocument();
    expect(saveBar()).toBeNull();
  });
});

describe("glossary save bar", () => {
  it("appears only once something changes and goes away on Discard", async () => {
    const { api } = renderTab();
    const rendering = await screen.findByDisplayValue("Elaina");
    expect(saveBar()).toBeNull();
    await userEvent.type(rendering, "!");
    expect(saveBar()).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByDisplayValue("Elaina")).toBeInTheDocument();
    expect(saveBar()).toBeNull();
    expect(api.saveProjectTerms).not.toHaveBeenCalled();
  });

  it("drops entries without a source or rendering when saving", async () => {
    const { api } = renderTab();
    await userEvent.click(await screen.findByRole("button", { name: "Add entry" }));
    expect(screen.getAllByRole("textbox", { name: "Source term" }).at(-1)).toHaveFocus();
    await userEvent.keyboard("サヤ");
    await userEvent.click(screen.getByRole("button", { name: "Save glossary" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Keep honorifics.",
      glossary: stored.glossary,
    });
  });

  it("asks before leaving the tab with unsaved changes", async () => {
    const { router } = renderTab();
    await userEvent.type(await screen.findByDisplayValue("Elaina"), "!");
    await userEvent.click(screen.getByRole("tab", { name: /Volumes/ }));

    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved glossary changes?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.search).toEqual({ tab: "glossary" });
    expect(screen.getByDisplayValue("Elaina!")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Volumes/ }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("leaves the tab without asking when nothing changed", async () => {
    const { router } = renderTab();
    await screen.findByDisplayValue("Elaina");
    await userEvent.click(screen.getByRole("tab", { name: /Volumes/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("glossary search", () => {
  it("filters the entries shown but saves them all", async () => {
    const { api } = renderTab();
    await screen.findByDisplayValue("Elaina");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search glossary" }), "ash");
    expect(screen.getAllByRole("textbox", { name: "Source term" })).toHaveLength(1);
    await userEvent.type(screen.getByDisplayValue("Ashen Witch"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save glossary" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Keep honorifics.",
      glossary: [
        { source: "イレイナ", target: "Elaina" },
        { source: "灰の魔女", target: "Ashen Witch!" },
      ],
    });
  });
});

const entries = (prefix: string, n: number): GlossaryEntry[] =>
  Array.from({ length: n }, (_, i) => ({ source: `${prefix}${i}`, target: `${prefix}-${i}` }));

function renderEditor(glossary: GlossaryEntry[], suggested: GlossaryEntry[]) {
  render(
    <>
      <GlossaryEditor
        glossary={glossary}
        conflicts={[]}
        volumeLabel={() => ""}
        saving={false}
        onSave={vi.fn(async () => undefined)}
        suggestions={(add) => (
          <button type="button" onClick={() => add(suggested)}>
            Add suggestions
          </button>
        )}
      />
      <Toaster />
    </>,
  );
}

describe("adding suggestions", () => {
  afterEach(() => toast.dismiss());

  it("highlights added suggestions until the glossary is saved", async () => {
    renderEditor(entries("old", 1), entries("new", 2));
    await userEvent.click(screen.getByRole("button", { name: "Suggest terms" }));
    await userEvent.click(screen.getByRole("button", { name: "Add suggestions" }));
    const rows = within(screen.getByRole("list", { name: "Glossary entries" })).getAllByRole(
      "listitem",
    );
    expect(rows.map((r) => r.hasAttribute("data-suggested"))).toEqual([true, true, false]);
    await userEvent.click(screen.getByRole("button", { name: "Save glossary" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Glossary entries" }))
          .getAllByRole("listitem")
          .some((r) => r.hasAttribute("data-suggested")),
      ).toBe(false),
    );
  });

  it("tells the reader how many suggestions the 2,000-entry limit left out", async () => {
    renderEditor(entries("old", MAX_GLOSSARY_ENTRIES - 2), [
      ...entries("old", 1),
      ...entries("new", 5),
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Suggest terms" }));
    await userEvent.click(screen.getByRole("button", { name: "Add suggestions" }));
    expect(
      await screen.findByText(
        "Added 2 suggestions. 3 were left out: a glossary holds at most 2,000 entries.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Source term" })).toHaveLength(
      MAX_GLOSSARY_ENTRIES,
    );
    expect(screen.getByRole("button", { name: "Add entry" })).toBeDisabled();
    expect(screen.getByText(/2,000 of 2,000 entries\. The glossary is full\./)).toBeInTheDocument();
  }, 60_000);
});
