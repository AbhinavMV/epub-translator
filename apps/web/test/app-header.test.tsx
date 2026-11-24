import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppHeader, type Crumb, volumeLabel } from "@/components/app-header";
import { createDeviceStores, DeviceStoresProvider } from "@/lib/device-stores";

function renderHeader(crumbs: Crumb[]) {
  const root = createRootRoute({ component: () => <AppHeader crumbs={crumbs} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <DeviceStoresProvider stores={createDeviceStores(null)}>
      <RouterProvider router={router} />
    </DeviceStoresProvider>,
  );
}

describe("AppHeader", () => {
  it("links each level above the current page and names the current one", async () => {
    renderHeader([
      { kind: "library" },
      { kind: "project", projectId: "p1", name: "Angel" },
      { kind: "current", label: "Vol. 2" },
    ]);
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Library" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Angel" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    const current = within(nav).getByText("Vol. 2");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
  });

  it("links a volume crumb to its editor", async () => {
    renderHeader([
      { kind: "project", projectId: "p1", name: "Angel" },
      { kind: "book", bookId: "b2", label: "Vol. 2" },
      { kind: "current", label: "Chapter 3" },
    ]);
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Vol. 2" })).toHaveAttribute("href", "/books/b2");
  });

  it("has the app mark and one Settings button, and no theme toggle", async () => {
    renderHeader([{ kind: "current", label: "Library" }]);
    expect(await screen.findByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Library" })).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Theme" })).not.toBeInTheDocument();
  });
});

describe("volumeLabel", () => {
  it("prefers the volume number, then the translated title", () => {
    expect(
      volumeLabel({ volumeNumber: 2.5, title: "天使 2.5", translatedTitle: "Angel 2.5" }),
    ).toBe("Vol. 2.5");
    expect(volumeLabel({ volumeNumber: null, title: "天使", translatedTitle: "Angel" })).toBe(
      "Angel",
    );
    expect(volumeLabel({ volumeNumber: null, title: "天使", translatedTitle: null })).toBe("天使");
  });
});
