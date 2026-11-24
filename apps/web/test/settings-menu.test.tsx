import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsMenu } from "@/components/settings-menu";
import { prefsStore } from "@/lib/reader-settings-store";

afterEach(() => prefsStore.set({ theme: "light" }));

async function openMenu() {
  const user = userEvent.setup();
  render(<SettingsMenu />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  return user;
}

describe("Settings menu", () => {
  it("offers the four themes by name, with the current one checked", async () => {
    prefsStore.set({ theme: "dark" });
    await openMenu();
    for (const name of ["Light", "Sepia", "Dark", "System"]) {
      expect(screen.getByRole("menuitemradio", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("switches the theme", async () => {
    const user = await openMenu();
    await user.click(screen.getByRole("menuitemradio", { name: "System" }));
    expect(prefsStore.get().theme).toBe("system");
  });

  it("shows no account items when the app runs locally", async () => {
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "API keys" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Admin/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Sign out/ })).not.toBeInTheDocument();
  });
});
