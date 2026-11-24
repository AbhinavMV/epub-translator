import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { lastOpenedStore } from "@/lib/last-opened-store";
import { renderAt, setUpRouteTests } from "./route-harness";

setUpRouteTests();

async function breadcrumb() {
  const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
  await within(nav).findByRole("link", { name: /お隣の天使様/ });
  return nav;
}

describe.each([
  ["editor", "/books/angel-2?chapter=c2", "Vol. 2"],
  ["reader", "/books/angel-2/read/c2", "Chapter 2 (translated)"],
])("%s shell", (_, path, current) => {
  it("shows Library / Project / the current page and Settings", async () => {
    renderAt(path);
    const nav = await breadcrumb();
    expect(within(nav).getByRole("link", { name: "Library" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: /お隣の天使様/ })).toHaveAttribute(
      "href",
      "/projects/project-angel",
    );
    expect(await within(nav).findByText(current)).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("records the open book and chapter for this device", async () => {
    renderAt(path);
    await waitFor(() =>
      expect(lastOpenedStore.get()).toMatchObject({ bookId: "angel-2", chapterId: "c2" }),
    );
  });
});

describe("reader contents sheet", () => {
  it("lists chapters with their status and opens the one chosen", async () => {
    const user = userEvent.setup();
    renderAt("/books/angel-2-5/read/c1");
    await user.click(await screen.findByRole("button", { name: "Contents" }));
    const sheet = await screen.findByRole("dialog", { name: "Contents" });
    const failed = await within(sheet).findAllByRole("img", { name: "Has failed passages" });
    const target = failed[0]?.closest("button");
    expect(target).toBeTruthy();
    if (target) await user.click(target);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Contents" })).toBeNull());
  });
});
