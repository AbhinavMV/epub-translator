import type {
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

describe("project glossary and prompt", () => {
  it("shows the glossary size and its unresolved conflicts", async () => {
    renderAt("/projects/p1", projectApi());
    const section = await screen.findByRole("region", { name: /glossary and prompt/i });
    expect(await within(section).findByText(/1 term/)).toBeInTheDocument();
    expect(within(section).getByText(/1 conflict/)).toBeInTheDocument();
  });

  it("saves glossary edits to the project, keeping its prompt", async () => {
    const api = projectApi();
    renderAt("/projects/p1", api);
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await userEvent.click(screen.getByRole("button", { name: /add term/i }));
    const sources = screen.getAllByRole("textbox", { name: "Source term" });
    const targets = screen.getAllByRole("textbox", { name: "Target term" });
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
    renderAt("/projects/p1", api);
    await userEvent.click(await screen.findByRole("button", { name: /edit prompt/i }));
    const box = screen.getByRole("textbox", { name: "Custom prompt" });
    await userEvent.clear(box);
    await userEvent.type(box, "Use a light tone.");
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "Use a light tone.",
      glossary: stored.glossary,
    });
  });

  it("shows the fixed rules read-only above the project's custom prompt", async () => {
    renderAt("/projects/p1", projectApi());
    await userEvent.click(await screen.findByRole("button", { name: /edit prompt/i }));
    const dialog = screen.getByRole("dialog");
    const rules = within(dialog).getByRole("region", { name: /fixed rules/i });
    expect(rules).toHaveTextContent(/FIDELITY RULES/);
    expect(rules).toHaveTextContent(/FORMAT RULES/);
    expect(rules).toHaveTextContent(
      /Translate the identified Japanese target passages into English/,
    );
    expect(within(rules).queryByRole("textbox")).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Custom prompt" })).toHaveValue(
      "Keep honorifics.",
    );
  });

  it("pre-fills the default style guidance and stores nothing when it is saved unchanged", async () => {
    const getProjectSettings = vi.fn(async () => ({ ...stored, customPrompt: "" }));
    const api = { ...projectApi(), getProjectSettings };
    renderAt("/projects/p1", api);
    await userEvent.click(await screen.findByRole("button", { name: /edit prompt/i }));
    expect(screen.getByRole("textbox", { name: "Custom prompt" })).toHaveValue(
      "Use natural, readable prose in the target language while preserving the source meaning.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save prompt" }));
    expect(api.saveProjectTerms).toHaveBeenCalledWith("p1", {
      customPrompt: "",
      glossary: stored.glossary,
    });
  });

  it("locks the volume picker while suggestions are running", async () => {
    const api = { ...projectApi(), suggestGlossary: () => new Promise<never>(() => {}) };
    renderAt("/projects/p1", api);
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await screen.findByText(/1 request/);
    const picker = screen.getByRole("combobox", { name: "Volume to sample" });
    expect(picker).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /suggest from book/i }));
    await waitFor(() => expect(picker).toBeDisabled());
  });

  it("suggests terms from the latest volume and adds accepted ones to the project", async () => {
    const suggestGlossary = vi.fn(async () => ({
      terms: [{ source: "サヤ", target: "Saya" }],
      usage: null,
    }));
    const api = { ...projectApi(), suggestGlossary };
    renderAt("/projects/p1", api);
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    await screen.findByText(/1 request/);
    await userEvent.click(await screen.findByRole("button", { name: /suggest from book/i }));
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

describe("book editor header", () => {
  it("links to the project instead of editing the glossary or prompt", async () => {
    const { router } = renderAt("/books/v1", projectApi(), () => (
      <EditorHeader
        bookId="v1"
        projectId="p1"
        title="魔女の旅々 1"
        translatedTitle={null}
        chapterId={undefined}
        jobId={undefined}
        providers={providers}
        selection={null}
        onSelection={() => {}}
        mode="live"
        batchAvailable={false}
        onMode={() => {}}
        targetLang="en"
        onTargetLang={() => {}}
        onOpenRail={() => {}}
      />
    ));
    const link = await screen.findByRole("link", { name: /project/i });
    expect(screen.queryByRole("button", { name: /^glossary/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit prompt/i })).toBeNull();
    await userEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1"));
  });
});
