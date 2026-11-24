import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";
import type { ProjectSeed } from "@/api/mock-seed";
import type { Vault } from "@/keys/vault";
import { glossarySkipStore } from "@/lib/glossary-skip-store";
import { createHostedApi } from "@/translate/hosted-api";
import type { ClientRuntime } from "@/translate/runtime";
import { renderAt, setUpRouteTests } from "./route-harness";

setUpRouteTests();

const failedAfterOne = ["done", ...Array<"failed">(40).fill("failed")] as const;

const NO_GLOSSARY: ProjectSeed[] = [
  {
    id: "project-plain",
    name: "素朴な物語",
    volumes: [
      {
        id: "plain-1",
        title: "素朴な物語 1",
        volumeNumber: 1,
        translations: [
          {
            lang: "en",
            bookTitle: "A Plain Story",
            chapters: { c1: ["done"], c2: failedAfterOne },
          },
        ],
      },
    ],
  },
  {
    id: "project-named",
    name: "名前のある物語",
    glossary: [{ source: "ホロ", target: "Holo" }],
    volumes: [{ id: "named-1", title: "名前のある物語 1", volumeNumber: 1 }],
  },
];

function spied(base: Api = createMockApi(NO_GLOSSARY)) {
  const api = {
    ...base,
    translateChapter: vi.fn(base.translateChapter),
    translateAll: vi.fn(base.translateAll),
    retryChapter: vi.fn(base.retryChapter),
  };
  const sent = () =>
    api.translateChapter.mock.calls.length +
    api.translateAll.mock.calls.length +
    api.retryChapter.mock.calls.length;
  return { api, sent };
}

const PROMPT = "Translate without a glossary?";
const phoneBar = () => screen.findByRole("group", { name: "Chapter actions" });

/** The toolbar's control, not the phone bar's copy of it. */
function toolbarButton(name: string | RegExp) {
  return waitFor(
    () => {
      const button = screen
        .getAllByRole("button", { name })
        .find((b) => !b.closest("fieldset[aria-label='Chapter actions']"));
      if (!button) throw new Error(`no toolbar button ${String(name)}`);
      expect(button).toBeEnabled();
      return button;
    },
    { timeout: 3000 },
  );
}

function enabled(find: () => HTMLElement | undefined) {
  return waitFor(
    () => {
      const button = find();
      if (!button) throw new Error("not found");
      expect(button).toBeEnabled();
      return button;
    },
    { timeout: 3000 },
  );
}

async function expectPromptHolds(sent: () => number) {
  const dialog = await screen.findByRole("dialog", { name: PROMPT });
  expect(sent()).toBe(0);
  return dialog;
}

async function translateAnyway(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog", { name: PROMPT });
  await user.click(within(dialog).getByRole("button", { name: "Translate anyway" }));
}

async function pickFromTranslateMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await toolbarButton("More translate options"));
  const menu = await screen.findByRole("menu");
  const item = await waitFor(
    () => {
      const found = within(menu).getByRole("menuitem", { name });
      expect(found).not.toHaveAttribute("data-disabled");
      return found;
    },
    { timeout: 3000 },
  );
  await user.click(item);
}

describe("glossary-first guard in the editor", () => {
  it("asks before translating a chapter, then sends it on Translate anyway", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    const dialog = await expectPromptHolds(sent);
    expect(dialog).toHaveTextContent("素朴な物語 has no glossary yet");
    await translateAnyway(user);
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
    expect(api.translateChapter.mock.calls[0]?.[1]).toBe("c3");
  });

  it("guards Translate all chapters", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await pickFromTranslateMenu(user, "All chapters");
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api.translateAll).toHaveBeenCalledTimes(1));
    expect(api.translateChapter).not.toHaveBeenCalled();
  });

  it("guards Title & contents", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await pickFromTranslateMenu(user, "Title & contents");
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
    expect(api.translateChapter.mock.calls[0]?.[1]).toBe("ch-contents");
  });

  it("guards Continue on a partly translated chapter", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c1", api);
    await user.click(await toolbarButton("Continue"));
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
    expect(api.translateChapter.mock.calls[0]?.[1]).toBe("c1");
  });

  it("guards Retry N failed", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c2", api);
    await user.click(await toolbarButton(/^Retry \d+ failed$/));
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
    expect(api.translateChapter.mock.calls[0]?.[1]).toBe("c2");
  });

  it("guards the Retry on a failed passage", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c2", api);
    const passageRetry = await enabled(() =>
      screen
        .queryAllByRole("button", { name: /^Retry (passage|\d+ failed)$/ })
        .find((b) => b.closest("[data-segment-id]")),
    );
    await user.click(passageRetry);
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
  });

  it("guards a batch submission and keeps it a batch", async () => {
    window.localStorage.setItem("et.translate-mode", "batch");
    try {
      const user = userEvent.setup();
      const { api, sent } = spied();
      renderAt("/books/plain-1?chapter=c3", api);
      await user.click(await toolbarButton("Translate chapter"));
      await expectPromptHolds(sent);
      await translateAnyway(user);
      await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
      expect(api.translateChapter.mock.calls[0]?.[2]).toMatchObject({ mode: "batch" });
    } finally {
      window.localStorage.removeItem("et.translate-mode");
    }
  });

  it("guards the phone bar's Translate", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    const bar = await phoneBar();
    await user.click(
      await enabled(
        () => within(bar).queryByRole("button", { name: "Translate chapter" }) ?? undefined,
      ),
    );
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["Translate all chapters", "translateAll"],
    ["Translate title & contents", "translateChapter"],
  ] as const)("guards %s in the More sheet", async (name, method) => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await toolbarButton("Translate chapter");
    await user.click(within(await phoneBar()).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "Vol. 1" });
    await user.click(within(sheet).getByRole("button", { name }));
    await expectPromptHolds(sent);
    await translateAnyway(user);
    await waitFor(() => expect(api[method]).toHaveBeenCalledTimes(1));
  });

  it("guards the hosted in-browser path before the runtime starts", async () => {
    const user = userEvent.setup();
    const base = createMockApi(NO_GLOSSARY);
    const runtime = {
      overlay: <T,>(job: T) => job,
      discoveredModels: () => [],
      abortChapter: () => {},
      translateChapter: vi.fn(async () => {}),
      translateAll: vi.fn(async () => {}),
    };
    const api: Api = {
      ...createHostedApi(base, runtime as unknown as ClientRuntime, {} as Vault),
      listProviders: base.listProviders,
    };
    renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    await screen.findByRole("dialog", { name: PROMPT });
    expect(runtime.translateChapter).not.toHaveBeenCalled();
    await translateAnyway(user);
    await waitFor(() => expect(runtime.translateChapter).toHaveBeenCalledTimes(1));
    await pickFromTranslateMenu(user, "All chapters");
    await waitFor(() => expect(runtime.translateAll).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: PROMPT })).toBeNull();
  });

  it("remembers Translate anyway for the project on this device", async () => {
    const user = userEvent.setup();
    const { api } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    await translateAnyway(user);
    expect(glossarySkipStore.isSkipped("project-plain")).toBe(true);
    await pickFromTranslateMenu(user, "All chapters");
    await waitFor(() => expect(api.translateAll).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: PROMPT })).toBeNull();
  });

  it("translates straight away once the project was skipped", async () => {
    glossarySkipStore.skip("project-plain");
    const user = userEvent.setup();
    const { api } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: PROMPT })).toBeNull();
  });

  it("does not ask when the project has a glossary", async () => {
    const user = userEvent.setup();
    const { api } = spied();
    renderAt("/books/named-1?chapter=c1", api);
    await user.click(await toolbarButton("Translate chapter"));
    await waitFor(() => expect(api.translateChapter).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: PROMPT })).toBeNull();
  });

  it("sends nothing and remembers nothing when the prompt is dismissed", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    await expectPromptHolds(sent);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: PROMPT })).toBeNull());
    expect(sent()).toBe(0);
    expect(glossarySkipStore.isSkipped("project-plain")).toBe(false);
  });

  it("Set up glossary opens the project's Glossary tab with Suggest terms, sending nothing", async () => {
    const user = userEvent.setup();
    const { api, sent } = spied();
    const { router } = renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    const dialog = await expectPromptHolds(sent);
    await user.click(within(dialog).getByRole("button", { name: "Set up glossary" }));
    await screen.findByText("project");
    expect(router.state.location.pathname).toBe("/projects/project-plain");
    expect(router.state.location.search).toMatchObject({ tab: "glossary", suggest: true });
    expect(sent()).toBe(0);
    expect(glossarySkipStore.isSkipped("project-plain")).toBe(false);
  });

  it("holds a translation started before the glossary has loaded", async () => {
    const user = userEvent.setup();
    const base = createMockApi(NO_GLOSSARY);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, sent } = spied({
      ...base,
      getProjectSettings: async (id) => {
        await gate;
        return base.getProjectSettings(id);
      },
    });
    renderAt("/books/plain-1?chapter=c3", api);
    await user.click(await toolbarButton("Translate chapter"));
    await new Promise((r) => setTimeout(r, 200));
    expect(sent()).toBe(0);
    release();
    await expectPromptHolds(sent);
  });
});
