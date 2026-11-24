import type {
  BookDetail,
  BookSummary,
  ProjectDetail,
  ProjectSettings,
  ProjectTerms,
  ProviderInfo,
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
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { EditorHeader } from "@/components/editor/editor-header";
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

function renderAt(path: string, overrides: Partial<Api>, bookPage: () => ReactNode = () => null) {
  const api = { ...createMockApi(), ...overrides };
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: "/projects/$projectId",
      component: ProjectPage,
    }),
    createRoute({ getParentRoute: () => root, path: "/books/$bookId", component: bookPage }),
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

const providers: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    configured: true,
    models: ["claude-sonnet-5-5"],
    defaultModel: "claude-sonnet-5-5",
    supportsBatch: false,
  },
];

const stored: ProjectSettings = {
  customPrompt: "Keep honorifics.",
  glossary: [{ source: "イレイナ", target: "Elaina" }],
  glossaryConflicts: [
    {
      source: "灰の魔女",
      inForce: { target: "Ashen Witch", bookId: "v2", volumeNumber: 2 },
      alternatives: [{ target: "Witch of Ashes", bookId: "v1", volumeNumber: 1 }],
    },
  ],
};

function projectApi(
  saveProjectTerms = vi.fn(async (_id: string, t: ProjectTerms) => ({ ...stored, ...t })),
) {
  return {
    getProject: vi.fn(async () => detail),
    getProjectSettings: vi.fn(async () => stored),
    listProviders: vi.fn(async () => providers),
    saveProjectTerms,
  };
}

describe("project glossary and custom prompt", () => {
  it("shows the glossary size and its unresolved conflicts", async () => {
    renderAt("/projects/p1?tab=glossary", projectApi());
    const section = await screen.findByRole("tabpanel", { name: /Glossary/ });
    expect(await within(section).findByText(/1 glossary entry,/)).toBeInTheDocument();
    expect(within(section).getByText(/1 glossary conflict/)).toBeInTheDocument();
  });

  it("saves glossary edits to the project, keeping its prompt", async () => {
    const api = projectApi();
    renderAt("/projects/p1?tab=glossary", api);
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await userEvent.click(screen.getByRole("button", { name: "Add entry" }));
    const sources = screen.getAllByRole("textbox", { name: "Source term" });
    const targets = screen.getAllByRole("textbox", { name: "Rendering" });
    await userEvent.type(sources.at(-1) as HTMLElement, "サヤ");
    await userEvent.type(targets.at(-1) as HTMLElement, "Saya");
    await userEvent.click(screen.getByRole("button", { name: "Save glossary" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Keep honorifics.",
      glossary: [
        { source: "イレイナ", target: "Elaina" },
        { source: "サヤ", target: "Saya" },
      ],
    });
  });

  it("saves the custom prompt to the project, keeping its glossary", async () => {
    const api = projectApi();
    renderAt("/projects/p1?tab=prompt", api);
    await userEvent.click(await screen.findByRole("button", { name: "Custom prompt" }));
    const box = screen.getByRole("textbox", { name: "Custom prompt" });
    await userEvent.clear(box);
    await userEvent.type(box, "Use a light tone.");
    await userEvent.click(screen.getByRole("button", { name: "Save custom prompt" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Use a light tone.",
      glossary: stored.glossary,
    });
  });

  it("shows the fixed rules without naming a language, since every target shares them", async () => {
    renderAt("/projects/p1?tab=prompt", projectApi());
    await userEvent.click(await screen.findByRole("button", { name: "Custom prompt" }));
    const rules = within(screen.getByRole("dialog")).getByRole("region", { name: /fixed rules/i });
    expect(rules.textContent?.split("\n")[0]).toBe(
      "Translate the identified source-language target passages into the target language.",
    );
  });

  it("shows the fixed rules read-only above the project's custom prompt", async () => {
    renderAt("/projects/p1?tab=prompt", projectApi());
    await userEvent.click(await screen.findByRole("button", { name: "Custom prompt" }));
    const dialog = screen.getByRole("dialog");
    const rules = within(dialog).getByRole("region", { name: /fixed rules/i });
    expect(rules).toHaveTextContent(/FIDELITY RULES/);
    expect(rules).toHaveTextContent(/FORMAT RULES/);
    expect(within(rules).queryByRole("textbox")).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Custom prompt" })).toHaveValue(
      "Keep honorifics.",
    );
  });

  it("pre-fills the default style guidance and stores nothing when it is saved unchanged", async () => {
    const getProjectSettings = vi.fn(async () => ({ ...stored, customPrompt: "" }));
    const api = { ...projectApi(), getProjectSettings };
    renderAt("/projects/p1?tab=prompt", api);
    await userEvent.click(await screen.findByRole("button", { name: "Custom prompt" }));
    expect(screen.getByRole("textbox", { name: "Custom prompt" })).toHaveValue(
      "Use natural, readable prose in the target language while preserving the source meaning.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save custom prompt" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "",
      glossary: stored.glossary,
    });
  });

  it("locks the volume picker while suggestions are running", async () => {
    const api = { ...projectApi(), suggestGlossary: () => new Promise<never>(() => {}) };
    renderAt("/projects/p1?tab=glossary", api);
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await screen.findByText(/1 request/);
    const picker = screen.getByRole("combobox", { name: "Volume to sample" });
    expect(picker).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Suggest from volume" }));
    await waitFor(() => expect(picker).toBeDisabled());
  });

  it("suggests terms from the latest volume and adds accepted ones to the project", async () => {
    const suggestGlossary = vi.fn(async () => ({
      terms: [{ source: "サヤ", target: "Saya" }],
      usage: null,
    }));
    const api = { ...projectApi(), suggestGlossary };
    renderAt("/projects/p1?tab=glossary", api);
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await screen.findByText(/1 request/);
    await userEvent.click(await screen.findByRole("button", { name: "Suggest from volume" }));
    expect(suggestGlossary).toHaveBeenCalledWith(
      "v2",
      expect.objectContaining({ targetLang: "en", sampleSize: "large", chunk: 0 }),
      expect.any(AbortSignal),
    );
    await userEvent.click(await screen.findByRole("button", { name: /add selected/i }));
    await userEvent.click(screen.getByRole("button", { name: "Save glossary" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Keep honorifics.",
      glossary: [
        { source: "イレイナ", target: "Elaina" },
        { source: "サヤ", target: "Saya" },
      ],
    });
  });
});

describe("suggesting from all volumes", () => {
  const plans: Record<string, { requests: number; chars: number }> = {
    v1: { requests: 2, chars: 80_000 },
    v2: { requests: 1, chars: 30_000 },
    v3: { requests: 1, chars: 10_000 },
  };
  const outOfOrder: ProjectDetail = {
    ...detail,
    books: [book("v3", 2.5), book("v1", 1), book("v2", 2)],
  };

  function allVolumesApi(suggestGlossary: Api["suggestGlossary"]) {
    return {
      ...projectApi(),
      getProject: vi.fn(async () => outOfOrder),
      planGlossarySample: vi.fn(
        async (bookId: string) => plans[bookId] ?? { requests: 0, chars: 0 },
      ),
      suggestGlossary: vi.fn(suggestGlossary),
    };
  }

  async function chooseAllVolumes() {
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await userEvent.click(screen.getByRole("combobox", { name: "Volume to sample" }));
    await userEvent.click(await screen.findByRole("option", { name: "All volumes" }));
  }

  it("shows the volume count, requests and characters before starting", async () => {
    renderAt(
      "/projects/p1?tab=glossary",
      allVolumesApi(async () => ({ terms: [], usage: null })),
    );
    await chooseAllVolumes();
    expect(await screen.findByText("3 volumes · 4 requests · ~120,000 chars")).toBeInTheDocument();
  });

  it("samples every volume in volume order, the earliest volume's rendering winning", async () => {
    const byVolume: Record<string, { source: string; target: string }[][]> = {
      v1: [[{ source: "灰の魔女", target: "Ashen Witch" }], [{ source: "サヤ", target: "Saya" }]],
      v2: [
        [
          { source: "サヤ", target: "Sayaa" },
          { source: "ミナ", target: "Mina" },
        ],
      ],
      v3: [[{ source: "フラン", target: "Fran" }]],
    };
    const api = allVolumesApi(async (bookId, body) => ({
      terms: byVolume[bookId]?.[body.chunk ?? 0] ?? [],
      usage: null,
    }));
    renderAt("/projects/p1?tab=glossary", api);
    await chooseAllVolumes();
    await within(screen.getByRole("dialog")).findByText(/3 volumes/);
    await userEvent.click(screen.getByRole("button", { name: "Suggest from all volumes" }));

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(4));
    expect(api.suggestGlossary.mock.calls.map(([id, body]) => [id, body.chunk])).toEqual([
      ["v1", 0],
      ["v1", 1],
      ["v2", 0],
      ["v3", 0],
    ]);
    expect(screen.getByText(/Saya$/)).toBeInTheDocument();
    expect(screen.queryByText(/Sayaa/)).not.toBeInTheDocument();
  });

  it("shows which volume is being sampled and keeps what was gathered when stopped", async () => {
    const api = allVolumesApi((bookId, _body, signal) =>
      bookId === "v1"
        ? Promise.resolve({ terms: [{ source: "サヤ", target: "Saya" }], usage: null })
        : new Promise<never>((_, reject) => {
            signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
    );
    renderAt("/projects/p1?tab=glossary", api);
    await chooseAllVolumes();
    await within(screen.getByRole("dialog")).findByText(/3 volumes/);
    await userEvent.click(screen.getByRole("button", { name: "Suggest from all volumes" }));
    expect(await screen.findByText("Suggesting… volume 2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Suggest from all volumes" })).toBeEnabled(),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ends the run on a failed request, keeping the terms gathered so far", async () => {
    const api = allVolumesApi(async (bookId) => {
      if (bookId === "v2") throw new Error("Rate limited");
      return { terms: [{ source: `${bookId}-term`, target: "T" }], usage: null };
    });
    renderAt("/projects/p1?tab=glossary", api);
    await chooseAllVolumes();
    await within(screen.getByRole("dialog")).findByText(/3 volumes/);
    await userEvent.click(screen.getByRole("button", { name: "Suggest from all volumes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(api.suggestGlossary).toHaveBeenCalledTimes(3);
  });
});

describe("book editor header", () => {
  it("links to the project from the breadcrumb instead of editing the glossary or prompt", async () => {
    const book = {
      ...detail.books[0],
      projectId: "p1",
      chapters: [],
      settings: {},
    } as unknown as BookDetail;
    const { router } = renderAt("/books/v1", projectApi(), () => (
      <EditorHeader
        bookId="v1"
        book={book}
        translatedTitle={null}
        chapterId={undefined}
        jobId={undefined}
        onOpenRail={() => {}}
      />
    ));
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    const link = await within(nav).findByRole("link", { name: detail.name });
    expect(screen.queryByRole("button", { name: /^glossary/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /custom prompt/i })).toBeNull();
    await userEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1"));
  });
});
