import { InviteSummarySchema, MeSchema, UserSummarySchema } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/api-context";
import { createMockApp } from "@/api/mock-app";
import { MOCK_HOSTED_KEY, mockHostedState } from "@/api/mock-hosted";
import type { AppServices } from "@/app-services";
import { AdminApiProvider } from "@/auth/admin-api";
import { AuthProvider } from "@/auth/auth-context";
import { RequireAuth } from "@/auth/require-auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HostedProvider } from "@/keys/hosted-context";
import { LibraryPage } from "@/routes/library";

function memoryStorage(initial: Record<string, string> = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => void rows.set(k, v),
    removeItem: (k: string) => void rows.delete(k),
  };
}

function renderLibrary(app: AppServices) {
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => (
        <RequireAuth>
          <LibraryPage />
        </RequireAuth>
      ),
    }),
    createRoute({ getParentRoute: () => root, path: "/signin", component: () => <p>sign in</p> }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const tree = (
    <ApiProvider api={app.api}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
  render(
    <AuthProvider client={app.client} {...(app.authFetch ? { fetchFn: app.authFetch } : {})}>
      <AdminApiProvider value={app.adminApi}>
        {app.hosted ? <HostedProvider hosted={app.hosted}>{tree}</HostedProvider> : tree}
      </AdminApiProvider>
    </AuthProvider>,
  );
}

describe("mock hosted switch", () => {
  it("is off unless asked for", () => {
    expect(mockHostedState("", memoryStorage())).toBeNull();
  });

  it("turns on from the URL and stays on for later page loads", () => {
    const storage = memoryStorage();
    expect(mockHostedState("?hosted=1", storage)).toBe("signed-in");
    expect(mockHostedState("", storage)).toBe("signed-in");
  });

  it("can start signed out, and turns off with hosted=0", () => {
    const storage = memoryStorage();
    expect(mockHostedState("?hosted=signed-out", storage)).toBe("signed-out");
    expect(mockHostedState("?hosted=0", storage)).toBeNull();
    expect(storage.getItem(MOCK_HOSTED_KEY)).toBeNull();
  });

  it("leaves local mode without auth, keys or hosted upload", async () => {
    const app = await createMockApp("", memoryStorage());
    expect(app.client).toBeNull();
    expect(app.hosted).toBeNull();
    expect(app.api.upload.mode).toBe("multipart");
  });

  it("gives hosted mode a signed-in admin, an admin API and signed uploads", async () => {
    const app = await createMockApp("?hosted=1", memoryStorage());
    expect(app.hosted).not.toBeNull();
    expect(app.api.upload.mode).toBe("signed");
    expect(await app.client?.getSession()).not.toBeNull();
    const me = MeSchema.parse(await (await (app.authFetch as typeof fetch)("/api/me")).json());
    expect(me.isAdmin).toBe(true);
    expect(InviteSummarySchema.array().parse(await app.adminApi.listInvites()).length).toBe(3);
    expect(UserSummarySchema.array().parse(await app.adminApi.listUsers()).length).toBeGreaterThan(
      1,
    );
  });

  it("remembers signing in and out across page loads", async () => {
    const storage = memoryStorage();
    const app = await createMockApp("?hosted=signed-out", storage);
    expect(await app.client?.getSession()).toBeNull();
    await app.client?.signIn("reader@example.com", "any password");
    expect(mockHostedState("", storage)).toBe("signed-in");
    await app.client?.signOut();
    expect(mockHostedState("", storage)).toBe("signed-out");
  });

  it("renders the library with hosted upload wording and the account menu", async () => {
    renderLibrary(await createMockApp("?hosted=1", memoryStorage()));
    expect(await screen.findByText(/Books are stored privately in your account\./)).toBeVisible();
    expect(await screen.findByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in", async () => {
    renderLibrary(await createMockApp("?hosted=signed-out", memoryStorage()));
    expect(await screen.findByText("sign in")).toBeInTheDocument();
  });
});
