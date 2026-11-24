import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAt, setUpRouteTests } from "./route-harness";

setUpRouteTests();

const phoneBar = () => screen.findByRole("group", { name: "Chapter actions" });

describe("editor bottom bar (phones)", () => {
  it("offers Chapters, the chapter's Translate button and More", async () => {
    renderAt("/books/angel-3?chapter=c1");
    const bar = await phoneBar();
    expect(within(bar).getByRole("button", { name: "Chapters" })).toBeInTheDocument();
    expect(
      await within(bar).findByRole("button", { name: "Translate chapter" }),
    ).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("shows the same Translate state as the desktop button", async () => {
    renderAt("/books/angel-1?chapter=c1");
    const bar = await phoneBar();
    expect(await within(bar).findByRole("button", { name: "Translated" })).toBeDisabled();
  });

  it("opens the chapter list as a sheet", async () => {
    const user = userEvent.setup();
    renderAt("/books/angel-1?chapter=c1");
    await user.click(within(await phoneBar()).getByRole("button", { name: "Chapters" }));
    expect(await screen.findByRole("dialog", { name: "Chapters" })).toBeInTheDocument();
  });
});

describe("editor More sheet (phones)", () => {
  async function openMore(path: string) {
    const user = userEvent.setup();
    renderAt(path);
    await user.click(within(await phoneBar()).getByRole("button", { name: "More" }));
    return { user, sheet: await screen.findByRole("dialog", { name: "Vol. 1" }) };
  }

  it("holds the model, Translate all, Title & contents, Proofread, Export and Read", async () => {
    const { sheet } = await openMore("/books/angel-1?chapter=c1");
    for (const name of [
      /^Model and mode · /,
      "Translate all chapters",
      "Translate title & contents",
      /^Proofread/,
      "Export",
    ]) {
      expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole("link", { name: "Read this volume" })).toHaveAttribute(
      "href",
      expect.stringContaining("/books/angel-1/read/c1"),
    );
  });

  it("counts the proofread suggestions waiting in this chapter and opens them", async () => {
    const { user, sheet } = await openMore("/books/angel-1?chapter=c1");
    expect(
      await within(sheet).findByRole("button", { name: /^Proofread, \d+ suggestions? waiting/ }),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /^Review \d+ suggestions?$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Vol. 1" })).toBeNull());
    expect(await screen.findByRole("dialog", { name: /proofread/i })).toBeInTheDocument();
  });

  it("opens the model sheet in its place", async () => {
    const { user, sheet } = await openMore("/books/angel-1?chapter=c1");
    await user.click(within(sheet).getByRole("button", { name: /^Model and mode · / }));
    expect(await screen.findByRole("dialog", { name: "Model and mode" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Vol. 1" })).toBeNull();
  });
});

describe("editor view switch (phones)", () => {
  it("starts on Both and switches the text to Translation or Source", async () => {
    const user = userEvent.setup();
    renderAt("/books/angel-1?chapter=c1");
    const show = await screen.findByRole("group", { name: "Show" });
    expect(within(show).getByRole("button", { name: "Both" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(show).getByRole("button", { name: "Source" }));
    expect(within(show).getByRole("button", { name: "Source" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.querySelector("[data-phone-view]")).toHaveAttribute(
      "data-phone-view",
      "source",
    );
  });

  it("replaces the old Show/Hide source toggle", async () => {
    renderAt("/books/angel-1?chapter=c1");
    await screen.findByRole("group", { name: "Show" });
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();
  });
});
