import type { BookSummary, ProjectSettings } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import { ProjectGlossaryPanel } from "@/components/project/project-terms";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
      alternatives: [{ target: "Witch of Ashes", bookId: "v1", volumeNumber: 1 }],
    },
  ],
};

const resolved: ProjectSettings = {
  ...stored,
  glossary: [
    { source: "イレイナ", target: "Elaina" },
    { source: "灰の魔女", target: "Witch of Ashes" },
  ],
  glossaryConflicts: [],
};

function renderSection(overrides: Partial<Api>) {
  const api = { ...createMockApi(), ...overrides };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiProvider api={api}>
        <ProjectGlossaryPanel projectId="p1" books={[book("v1", 1), book("v2", 2)]} />
      </ApiProvider>
    </QueryClientProvider>,
  );
}

async function openConflicts() {
  await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
  await userEvent.click(screen.getByRole("button", { name: "1 conflict" }));
  return screen.getByRole("list", { name: "Glossary conflicts" });
}

describe("glossary conflicts", () => {
  it("lists each conflict's renderings with the volume they came from", async () => {
    renderSection({ getProjectSettings: vi.fn(async () => stored) });
    const list = await openConflicts();
    const conflict = within(list).getByRole("listitem");
    expect(within(conflict).getByText("灰の魔女")).toBeInTheDocument();
    const inForce = within(conflict).getByRole("button", { name: /^Ashen Witch/ });
    expect(inForce).toHaveAccessibleName(/Volume 2.*in force/);
    expect(within(conflict).getByRole("button", { name: /^Witch of Ashes/ })).toHaveAccessibleName(
      /Volume 1/,
    );
    expect(screen.queryByRole("textbox", { name: "Source term" })).toBeNull();
  });

  it("picking a rendering resolves the conflict and updates the entry", async () => {
    const resolveGlossaryConflict = vi.fn(async () => resolved);
    renderSection({ getProjectSettings: vi.fn(async () => stored), resolveGlossaryConflict });
    const list = await openConflicts();
    await userEvent.click(within(list).getByRole("button", { name: /^Witch of Ashes/ }));

    expect(resolveGlossaryConflict).toHaveBeenCalledWith("p1", {
      source: "灰の魔女",
      target: "Witch of Ashes",
    });
    expect(await screen.findAllByRole("textbox", { name: "Rendering" })).toHaveLength(2);
    expect(screen.getByDisplayValue("Witch of Ashes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /conflict/ })).toBeNull();
  });

  it("offers no conflict filter when there are none", async () => {
    renderSection({ getProjectSettings: vi.fn(async () => resolved) });
    await userEvent.click(await screen.findByRole("button", { name: /^glossary/i }));
    expect(screen.getAllByRole("textbox", { name: "Source term" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /conflict/ })).toBeNull();
  });
});
