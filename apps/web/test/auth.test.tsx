import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "@/auth/authed-fetch";
import { InvitePage, readInviteToken } from "@/routes/invite";
import { SignInPage } from "@/routes/signin";
import {
  FakeAuthClient,
  ME,
  notImplemented,
  recordingFetch,
  renderApp,
  SESSION,
} from "./auth-helpers";

const Library = () => <h1>Library page</h1>;
const SignInStub = () => <h1>Sign in page</h1>;

afterEach(() => {
  window.location.hash = "";
});

describe("RequireAuth", () => {
  it("redirects to /signin when signed out", async () => {
    const client = new FakeAuthClient(null);
    renderApp({
      path: "/",
      client,
      routes: { "/": Library, "/signin": SignInStub },
      guarded: ["/"],
    });
    expect(await screen.findByText("Sign in page")).toBeInTheDocument();
  });

  it("renders children when signed in", async () => {
    const client = new FakeAuthClient(SESSION);
    renderApp({
      path: "/",
      client,
      routes: { "/": Library, "/signin": SignInStub },
      guarded: ["/"],
    });
    expect(await screen.findByText("Library page")).toBeInTheDocument();
  });

  it("does nothing in local mode", async () => {
    renderApp({
      path: "/",
      client: null,
      routes: { "/": Library, "/signin": SignInStub },
      guarded: ["/"],
    });
    expect(await screen.findByText("Library page")).toBeInTheDocument();
  });

  it("signs out and shows the server message when the account is disabled", async () => {
    const client = new FakeAuthClient(SESSION);
    renderApp({
      path: "/",
      client,
      fetchFn: recordingFetch(null).fetchFn,
      routes: { "/": Library, "/signin": SignInPage },
      guarded: ["/"],
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Account disabled");
    expect(client.signOutCalls).toBe(1);
  });
});

describe("sign-in", () => {
  it("signs in, syncs the session cookie and lands on the library", async () => {
    const client = new FakeAuthClient(null);
    const { fetchFn, calls } = recordingFetch();
    renderApp({
      path: "/signin",
      client,
      fetchFn,
      routes: { "/": Library, "/signin": SignInPage },
    });
    await userEvent.type(await screen.findByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "right-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Library page")).toBeInTheDocument();
    expect(client.signInCalls).toEqual([["me@example.com", "right-password"]]);
    const cookieCall = calls.find((c) => c.url === "/api/session" && c.method === "POST");
    expect(cookieCall?.authorization).toBe(`Bearer ${SESSION.accessToken}`);
  });

  it("sets the image session cookie before showing signed-in pages", async () => {
    const client = new FakeAuthClient(null);
    const { fetchFn: base } = recordingFetch();
    let releaseCookie = () => {};
    const cookieSet = new Promise<void>((r) => {
      releaseCookie = r;
    });
    const fetchFn: typeof fetch = async (input, init) => {
      if (String(input) === "/api/session" && init?.method === "POST") await cookieSet;
      return base(input, init);
    };
    renderApp({
      path: "/signin",
      client,
      fetchFn,
      routes: { "/": Library, "/signin": SignInPage },
    });
    await userEvent.type(await screen.findByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "right-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Library page")).not.toBeInTheDocument();
    releaseCookie();
    expect(await screen.findByText("Library page")).toBeInTheDocument();
  });

  it("shows a generic error on bad credentials", async () => {
    const client = new FakeAuthClient(null);
    renderApp({ path: "/signin", client, routes: { "/": Library, "/signin": SignInPage } });
    await userEvent.type(await screen.findByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
  });

  it("offers no sign-up link", async () => {
    renderApp({
      path: "/signin",
      client: new FakeAuthClient(null),
      routes: { "/signin": SignInPage },
    });
    await screen.findByLabelText("Email");
    expect(screen.queryByText(/sign up|register|create account/i)).toBeNull();
  });
});

describe("authedFetch", () => {
  it("attaches the bearer header and never puts the token in the url", async () => {
    const { fetchFn, calls } = recordingFetch();
    await authedFetch(new FakeAuthClient(SESSION), fetchFn)("/api/books");
    expect(calls[0]?.authorization).toBe("Bearer jwt-1");
    expect(calls[0]?.url).toBe("/api/books");
  });

  it("sends no header when signed out", async () => {
    const { fetchFn, calls } = recordingFetch();
    await authedFetch(new FakeAuthClient(null), fetchFn)("/api/books");
    expect(calls[0]?.authorization).toBeNull();
  });
});

describe("invite page", () => {
  it("parses the fragment", () => {
    expect(readInviteToken("#t=abc_-9")).toBe("abc_-9");
    expect(readInviteToken("")).toBeNull();
    expect(readInviteToken("#x=1")).toBeNull();
  });

  it("posts the token in the body, never in a url, then signs in", async () => {
    window.location.hash = "#t=secret-token";
    const client = new FakeAuthClient(null);
    client.validPassword = "long-enough-pw";
    const accept = vi.fn().mockResolvedValue(undefined);
    const { fetchFn, calls } = recordingFetch();
    renderApp({
      path: "/invite",
      client,
      fetchFn,
      adminApi: { ...notImplemented(), acceptInvite: accept },
      routes: { "/": Library, "/invite": InvitePage, "/signin": SignInStub },
    });
    await userEvent.type(await screen.findByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pw");
    await userEvent.type(screen.getByLabelText("Confirm password"), "long-enough-pw");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Library page")).toBeInTheDocument();
    expect(accept).toHaveBeenCalledWith({
      token: "secret-token",
      email: "new@example.com",
      password: "long-enough-pw",
    });
    expect(client.signInCalls).toEqual([["new@example.com", "long-enough-pw"]]);
    expect(calls.some((c) => c.url.includes("secret-token"))).toBe(false);
    expect(window.location.href).not.toContain("secret-token");
  });

  it("validates password length and confirmation before calling the api", async () => {
    window.location.hash = "#t=tok";
    const accept = vi.fn();
    renderApp({
      path: "/invite",
      client: new FakeAuthClient(null),
      adminApi: { ...notImplemented(), acceptInvite: accept },
      routes: { "/invite": InvitePage },
    });
    await userEvent.type(await screen.findByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "0123456789");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different-one");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    expect(accept).not.toHaveBeenCalled();
  });

  it("explains a link without a code", async () => {
    renderApp({ path: "/invite", routes: { "/invite": InvitePage } });
    expect(await screen.findByText("Invite link incomplete")).toBeInTheDocument();
  });

  it("surfaces the server error and stays on the form", async () => {
    window.location.hash = "#t=tok";
    renderApp({
      path: "/invite",
      client: new FakeAuthClient(null),
      adminApi: {
        ...notImplemented(),
        acceptInvite: async () => {
          throw new Error("This invite is invalid or has expired");
        },
      },
      routes: { "/invite": InvitePage },
    });
    await userEvent.type(await screen.findByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "0123456789");
    await userEvent.type(screen.getByLabelText("Confirm password"), "0123456789");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("invalid or has expired"),
    );
  });
});

void ME;
