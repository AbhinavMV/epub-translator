import type { InviteSummary, Me, UserSummary } from "@et/contracts";
import type { AdminApi } from "@/auth/admin-api";
import type { AuthClient, AuthEvent, AuthSession } from "@/auth/auth-client";
import type { FetchFn } from "@/auth/authed-fetch";

export const MOCK_HOSTED_KEY = "et.mockHosted";

export type MockHostedState = "signed-in" | "signed-out";

export type MockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const URL_VALUES: Record<string, MockHostedState | null> = {
  "1": "signed-in",
  "signed-in": "signed-in",
  "signed-out": "signed-out",
  "0": null,
};

export function mockHostedState(search: string, storage: MockStorage): MockHostedState | null {
  const asked = new URLSearchParams(search).get("hosted");
  if (asked !== null && asked in URL_VALUES) {
    const next = URL_VALUES[asked] ?? null;
    if (next) storage.setItem(MOCK_HOSTED_KEY, next);
    else storage.removeItem(MOCK_HOSTED_KEY);
  }
  const stored = storage.getItem(MOCK_HOSTED_KEY);
  return stored === "signed-in" || stored === "signed-out" ? stored : null;
}

const MOCK_EMAIL = "a.reader.with.a.rather.long.address@translations.example.com";

const ME: Me = { id: "mock-user", email: MOCK_EMAIL, role: "admin", isAdmin: true };

const SESSION: AuthSession = { accessToken: "mock-token", userId: ME.id, email: ME.email };

export class MockAuthClient implements AuthClient {
  private readonly listeners = new Set<(event: AuthEvent, session: AuthSession | null) => void>();

  constructor(private readonly storage: MockStorage) {}

  async getSession() {
    return this.storage.getItem(MOCK_HOSTED_KEY) === "signed-in" ? SESSION : null;
  }

  async signIn() {
    this.storage.setItem(MOCK_HOSTED_KEY, "signed-in");
    this.emit("SIGNED_IN", SESSION);
  }

  async signOut() {
    this.storage.setItem(MOCK_HOSTED_KEY, "signed-out");
    this.emit("SIGNED_OUT", null);
  }

  async updatePassword() {}

  onChange(listener: (event: AuthEvent, session: AuthSession | null) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private emit(event: AuthEvent, session: AuthSession | null) {
    for (const listener of this.listeners) listener(event, session);
  }
}

export const mockAuthFetch: FetchFn = async (input) => {
  const path = String(input instanceof Request ? input.url : input);
  if (path.endsWith("/api/me")) return Response.json(ME);
  if (path.endsWith("/api/session")) return new Response(null, { status: 204 });
  return Response.json({ error: "Not available in the mock API" }, { status: 404 });
};

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export function createMockAdminApi(): AdminApi {
  let invites: InviteSummary[] = [
    {
      id: "invite-pending",
      email: "an.invited.friend.with.a.very.long.email.address@example-bookclub.org",
      createdAt: hoursFromNow(-2),
      expiresAt: hoursFromNow(70),
      usedAt: null,
      status: "pending",
    },
    {
      id: "invite-used",
      email: "kenji@example.com",
      createdAt: hoursFromNow(-200),
      expiresAt: hoursFromNow(-128),
      usedAt: hoursFromNow(-190),
      status: "used",
    },
    {
      id: "invite-expired",
      email: null,
      createdAt: hoursFromNow(-400),
      expiresAt: hoursFromNow(-328),
      usedAt: null,
      status: "expired",
    },
  ];
  let users: UserSummary[] = [
    { id: ME.id, email: ME.email, role: "admin", disabled: false },
    { id: "user-kenji", email: "kenji@example.com", role: "user", disabled: false },
    {
      id: "user-disabled",
      email: "someone.who.no.longer.translates.here@example.org",
      role: "user",
      disabled: true,
    },
  ];
  const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 80));

  return {
    listInvites: () => later(structuredClone(invites)),
    async createInvite(body) {
      const invite: InviteSummary = {
        id: `invite-${invites.length + 1}`,
        email: body.email ?? null,
        createdAt: new Date().toISOString(),
        expiresAt: hoursFromNow(body.expiresInHours ?? 72),
        usedAt: null,
        status: "pending",
      };
      invites = [invite, ...invites];
      return later({ invite, token: `mock-token-${invite.id}` });
    },
    async revokeInvite(id) {
      invites = invites.filter((i) => i.id !== id);
      await later(null);
    },
    listUsers: () => later(structuredClone(users)),
    async setUserDisabled(id, disabled) {
      users = users.map((u) => (u.id === id ? { ...u, disabled } : u));
      await later(null);
    },
    resetLink: (id) => later(`${window.location.origin}/reset#mock-recovery-${id}`),
    async deleteUser(id) {
      users = users.filter((u) => u.id !== id);
      await later(null);
    },
    acceptInvite: () => later(undefined),
  };
}
