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
import { beforeEach, describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/api-context";
import { createMockApi } from "@/api/mock";
import { MOCK_SEED, type ProjectSeed } from "@/api/mock-seed";
import { TooltipProvider } from "@/components/ui/tooltip";
import { glossarySkipStore } from "@/lib/glossary-skip-store";
import { ProjectPage, parseProjectSearch } from "@/routes/project";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const ALL_DONE = { c1: "done", c2: "done", c3: "done" } as const;

const SEED: ProjectSeed[] = [
  ...MOCK_SEED,
  {
    id: "project-single",
    name: "一冊だけ",
    volumes: [{ id: "single-1", title: "一冊だけ 1", volumeNumber: 1 }],
  },
  {
    id: "project-finished",
    name: "終わった物語",
    volumes: [
      {
        id: "finished-1",
        title: "終わった物語 1",
        volumeNumber: 1,
        translations: [{ lang: "en", bookTitle: "A Finished Story", chapters: ALL_DONE }],
      },
    ],
  },
];

function renderProject(path: string) {
  const root = createRootRoute({ component: Outlet });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/projects/$projectId",
        validateSearch: parseProjectSearch,
        component: ProjectPage,
      }),
      createRoute({ getParentRoute: () => root, path: "/books/$bookId", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiProvider api={createMockApi(SEED)}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { router };
}

const warning = () => screen.findByRole("region", { name: "No glossary yet" });
const noWarning = async () => {
  await screen.findByRole("tab", { name: /Volumes/ });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: /Glossary/ })).toHaveTextContent(/\d/),
  );
  expect(screen.queryByRole("region", { name: "No glossary yet" })).toBeNull();
};

beforeEach(() => glossarySkipStore.clear());

describe("glossary warning on the project page", () => {
  it("warns about a project with no glossary and untranslated volumes", async () => {
    renderProject("/projects/project-long");
    const notice = await warning();
    expect(notice).toHaveTextContent("Set up the glossary before you translate.");
    expect(within(notice).getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    expect(within(notice).getByRole("button", { name: "Suggest terms" })).toBeInTheDocument();
  });

  it("stays off the Glossary tab, which already offers Suggest terms", async () => {
    renderProject("/projects/project-long?tab=glossary");
    await noWarning();
  });

  it("does not warn when the project has glossary entries", async () => {
    renderProject("/projects/project-angel");
    await noWarning();
  });

  it("does not warn once every volume is translated", async () => {
    renderProject("/projects/project-finished");
    await noWarning();
  });

  it("Skip for now hides it and remembers that for the project on this device", async () => {
    const user = userEvent.setup();
    renderProject("/projects/project-long");
    await user.click(within(await warning()).getByRole("button", { name: "Skip for now" }));
    expect(screen.queryByRole("region", { name: "No glossary yet" })).toBeNull();
    expect(glossarySkipStore.isSkipped("project-long")).toBe(true);
    expect(glossarySkipStore.isSkipped("project-angel")).toBe(false);
  });

  it("stays hidden on a later visit after Skip for now", async () => {
    glossarySkipStore.skip("project-long");
    renderProject("/projects/project-long");
    await noWarning();
  });

  it("Suggest terms opens the Glossary tab with the panel reading all volumes", async () => {
    const user = userEvent.setup();
    const { router } = renderProject("/projects/project-long");
    await user.click(within(await warning()).getByRole("button", { name: "Suggest terms" }));
    const panel = await screen.findByRole("region", { name: "Suggest terms" });
    await waitFor(() => expect(panel).toBeVisible());
    expect(router.state.location.search).toMatchObject({ tab: "glossary" });
    expect(await within(panel).findByRole("combobox", { name: "Read from" })).toHaveTextContent(
      "All volumes",
    );
  });

  it("Suggest terms reads Vol. 1 when the project has a single volume", async () => {
    const user = userEvent.setup();
    renderProject("/projects/project-single");
    await user.click(within(await warning()).getByRole("button", { name: "Suggest terms" }));
    const panel = await screen.findByRole("region", { name: "Suggest terms" });
    expect(await within(panel).findByRole("combobox", { name: "Read from" })).toHaveTextContent(
      "Vol. 1",
    );
  });

  it("goes away once the glossary is saved with an entry", async () => {
    const user = userEvent.setup();
    renderProject("/projects/project-long");
    await warning();
    await user.click(screen.getByRole("tab", { name: /Glossary/ }));
    await user.click(await screen.findByRole("button", { name: "Add entry" }));
    await user.type(screen.getByRole("textbox", { name: "Source term" }), "王女");
    await user.type(screen.getByRole("textbox", { name: "Rendering" }), "the Princess");
    await user.click(screen.getByRole("button", { name: "Save glossary" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Glossary/ })).toHaveTextContent("1"),
    );
    await user.click(screen.getByRole("tab", { name: /Volumes/ }));
    await noWarning();
  });
});
