import type { AuthClient } from "./auth-client";

export type FetchFn = typeof fetch;

export function authedFetch(
  client: Pick<AuthClient, "getSession">,
  base: FetchFn = (...args) => fetch(...args),
  onUnauthorized?: () => void,
): FetchFn {
  return async (input, init) => {
    const session = await client.getSession();
    const headers = new Headers(init?.headers);
    if (session) headers.set("Authorization", `Bearer ${session.accessToken}`);
    const res = await base(input, { ...init, headers });
    if (res.status === 401) onUnauthorized?.();
    return res;
  };
}

export async function syncSessionCookie(base: FetchFn, accessToken: string): Promise<void> {
  try {
    await base("/api/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Cover images fall back to broken until the next refresh; sign-in itself still works.
  }
}

export async function clearSessionCookie(base: FetchFn): Promise<void> {
  try {
    await base("/api/session", { method: "DELETE" });
  } catch {
    // Best effort: the cookie is HttpOnly and expires on its own within the hour.
  }
}
