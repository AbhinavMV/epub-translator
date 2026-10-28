import type { InviteSummary, UserSummary } from "@et/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminPage, inviteLink } from "@/routes/admin";
import { FakeAuthClient, notImplemented, recordingFetch, renderApp, SESSION } from "./auth-helpers";

const adminMe = { id: "u1", email: "me@example.com", role: "admin" as const, isAdmin: true };

const users: UserSummary[] = [
  { id: "u1", email: "me@example.com", role: "admin", disabled: false },
  { id: "u2", email: "reader@example.com", role: "user", disabled: false },
];
const invite: InviteSummary = {
  id: "i1",
  email: null,
  createdAt: "2026-10-28T00:00:00.000Z",
  expiresAt: "2026-10-31T00:00:00.000Z",
  usedAt: null,
  status: "pending",
};

function setup(overrides: Partial<ReturnType<typeof notImplemented>> = {}) {
  const adminApi = {
    ...notImplemented(),
    listInvites: async () => [invite],
    listUsers: async () => users,
    ...overrides,
  };
  renderApp({
    path: "/admin",
    client: new FakeAuthClient(SESSION),
    fetchFn: recordingFetch(adminMe).fetchFn,
    adminApi,
    routes: { "/admin": AdminPage },
  });
  return adminApi;
}

describe("AdminPage", () => {
  it("builds the invite link with the token in the fragment", () => {
    expect(inviteLink("https://app.test", "abc")).toBe("https://app.test/invite#t=abc");
  });

  it("lists invites and users", async () => {
    setup();
    expect(await screen.findByText("Anyone with the link")).toBeInTheDocument();
    expect(await screen.findByText("reader@example.com")).toBeInTheDocument();
  });

  it("creates an invite and shows the link once", async () => {
    const createInvite = vi.fn().mockResolvedValue({ invite, token: "tok-123" });
    setup({ createInvite });
    await userEvent.type(await screen.findByLabelText("Email (optional)"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Create invite" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Link")).toHaveValue(
      `${window.location.origin}/invite#t=tok-123`,
    );
    expect(createInvite).toHaveBeenCalledWith({ email: "new@example.com", expiresInHours: 72 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("revokes an invite", async () => {
    const revokeInvite = vi.fn().mockResolvedValue(undefined);
    setup({ revokeInvite });
    await userEvent.click(await screen.findByRole("button", { name: /Revoke invite/ }));
    expect(revokeInvite).toHaveBeenCalledWith("i1");
  });

  it("asks for confirmation in-app before deleting a user", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    setup({ deleteUser });
    await userEvent.click(await screen.findByRole("button", { name: "Delete reader@example.com" }));
    expect(deleteUser).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete user" }));
    expect(deleteUser).toHaveBeenCalledWith("u2");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not offer disable or delete for yourself", async () => {
    setup();
    await screen.findByText("reader@example.com");
    expect(screen.queryByRole("button", { name: "Delete me@example.com" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable me@example.com" })).toBeNull();
  });

  it("disables a user and fetches a reset link", async () => {
    const setUserDisabled = vi.fn().mockResolvedValue(undefined);
    const resetLink = vi.fn().mockResolvedValue("https://auth.test/verify?x=1");
    setup({ setUserDisabled, resetLink });
    await userEvent.click(
      await screen.findByRole("button", { name: "Disable reader@example.com" }),
    );
    expect(setUserDisabled).toHaveBeenCalledWith("u2", true);
    await userEvent.click(
      screen.getByRole("button", { name: "Reset link for reader@example.com" }),
    );
    expect(await screen.findByLabelText("Link")).toHaveValue("https://auth.test/verify?x=1");
  });

  it("refuses non-admins", async () => {
    renderApp({
      path: "/admin",
      client: new FakeAuthClient(SESSION),
      routes: { "/admin": AdminPage },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have access/);
  });
});
