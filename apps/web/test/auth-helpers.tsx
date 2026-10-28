import type { Me } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { type AdminApi, AdminApiProvider } from "@/auth/admin-api";
import { type AuthClient, type AuthEvent, AuthFailure, type AuthSession } from "@/auth/auth-client";
import { AuthProvider } from "@/auth/auth-context";
import { RequireAuth } from "@/auth/require-auth";

export const SESSION: AuthSession = { accessToken: "jwt-1", userId: "u1", email: "me@example.com" };

export class FakeAuthClient implements AuthClient {
  session: AuthSession | null;
  signInCalls: [string, string][] = [];
  signOutCalls = 0;
  validPassword = "right-password";
  private listeners = new Set<(e: AuthEvent, s: AuthSession | null) => void>();

  constructor(session: AuthSession | null = null) {
    this.session = session;
  }
  async getSession() {
    return this.session;
  }
  async signIn(email: string, password: string) {
    this.signInCalls.push([email, password]);
    if (password !== this.validPassword) throw new AuthFailure("Incorrect email or password");
    this.session = SESSION;
    this.emit("SIGNED_IN");
  }
  async signOut() {
    this.signOutCalls += 1;
    this.session = null;
    this.emit("SIGNED_OUT");
  }
  async updatePassword() {}
  onChange(listener: (e: AuthEvent, s: AuthSession | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: AuthEvent) {
    for (const l of this.listeners) l(event, this.session);
  }
}

export interface RecordedCall {
  url: string;
  method: string;
  authorization: string | null;
}

export function recordingFetch(me: Me | null = ME) {
  const calls: RecordedCall[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
    });
    if (url === "/api/me") {
      return me ? Response.json(me) : Response.json({ error: "Account disabled" }, { status: 403 });
    }
    return new Response(null, { status: 204 });
  };
  return { fetchFn, calls };
}

export const ME: Me = { id: "u1", email: "me@example.com", role: "user", isAdmin: false };

export function notImplemented(): AdminApi {
  const fail = () => Promise.reject(new Error("not implemented"));
  return {
    listInvites: fail,
    createInvite: fail,
    revokeInvite: fail,
    listUsers: fail,
    setUserDisabled: fail,
    resetLink: fail,
    deleteUser: fail,
    acceptInvite: fail,
  };
}

interface Options {
  path: string;
  routes: Record<string, () => ReactNode>;
  client?: AuthClient | null;
  fetchFn?: typeof fetch;
  adminApi?: AdminApi;
  guarded?: string[];
}

export function renderApp({
  path,
  routes,
  client = null,
  fetchFn = recordingFetch().fetchFn,
  adminApi = notImplemented(),
  guarded = [],
}: Options) {
  const root = createRootRoute({ component: Outlet });
  const children = Object.entries(routes).map(([routePath, Component]) =>
    createRoute({
      getParentRoute: () => root,
      path: routePath,
      component: guarded.includes(routePath)
        ? () => (
            <RequireAuth>
              <Component />
            </RequireAuth>
          )
        : Component,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(children),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactNode) => (
    <AuthProvider client={client} fetchFn={fetchFn}>
      <AdminApiProvider value={adminApi}>
        <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
      </AdminApiProvider>
    </AuthProvider>
  );
  const result = render(wrap(<RouterProvider router={router} />));
  return { ...result, router };
}
