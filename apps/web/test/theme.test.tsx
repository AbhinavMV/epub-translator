import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeviceStores, DeviceStoresProvider } from "@/lib/device-stores";
import { useApplyTheme } from "@/lib/theme";

function fakeDarkQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", () => query);
  return (dark: boolean) => {
    query.matches = dark;
    for (const l of listeners) l();
  };
}

function Probe() {
  return <span data-testid="theme">{useApplyTheme()}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe("useApplyTheme", () => {
  it("follows the device live when the theme is System", () => {
    const setDark = fakeDarkQuery(false);
    const stores = createDeviceStores(null);
    stores.prefs.set({ theme: "system" });
    render(
      <DeviceStoresProvider stores={stores}>
        <Probe />
      </DeviceStoresProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    act(() => setDark(true));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores the device for a named theme", () => {
    const setDark = fakeDarkQuery(false);
    const stores = createDeviceStores(null);
    stores.prefs.set({ theme: "sepia" });
    render(
      <DeviceStoresProvider stores={stores}>
        <Probe />
      </DeviceStoresProvider>,
    );
    act(() => setDark(true));
    expect(document.documentElement.dataset.theme).toBe("sepia");
  });
});
