import {
  type AppUserRepository,
  type AuthAdmin,
  type Clock,
  ForbiddenError,
  type Hasher,
  type IdentityVerifier,
  type InviteRepository,
  type RandomSource,
  type RateLimiter,
  UnauthorizedError,
} from "@et/core";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv, AuthedUser } from "./request-context.ts";

export const SESSION_COOKIE = "et_session";
export const SESSION_COOKIE_PATH = "/api/books";

export interface AuthDeps {
  verifier: IdentityVerifier;
  users: AppUserRepository;
  invites: InviteRepository;
  admin: AuthAdmin;
  random: RandomSource;
  hasher: Hasher;
  clock: Clock;
  rateLimiter: RateLimiter;
  adminEmails: ReadonlySet<string>;
  publicConfig: { supabaseUrl: string; supabasePublishableKey: string };
}

const PUBLIC_ROUTES = new Set([
  "POST /api/invites/accept",
  "GET /api/config",
  "DELETE /api/session",
]);
const COOKIE_ROUTE = /^\/api\/books\/[^/]+\/(cover|assets\/.+|chapters\/[^/]+)$/;
const BEARER = /^Bearer\s+(\S+)$/i;

export const isAdmin = (user: AuthedUser, adminEmails: ReadonlySet<string>): boolean =>
  user.role === "admin" && adminEmails.has(user.email.toLowerCase());

function credential(
  method: string,
  path: string,
  header: string | undefined,
  cookie: string | undefined,
) {
  const bearer = header ? BEARER.exec(header)?.[1] : undefined;
  if (header !== undefined) return bearer ?? null;
  if (method === "GET" && COOKIE_ROUTE.test(path)) return cookie ?? null;
  return null;
}

export function authMiddleware(auth: AuthDeps | undefined) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!auth || PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) return next();

    const token = credential(
      c.req.method,
      c.req.path,
      c.req.header("authorization"),
      getCookie(c, SESSION_COOKIE),
    );
    const identity = token ? await auth.verifier.verify(token) : null;
    if (!identity) throw new UnauthorizedError();

    let row = await auth.users.get(identity.userId);
    if (!row) {
      if (!auth.adminEmails.has(identity.email.toLowerCase())) {
        throw new ForbiddenError("Account not provisioned");
      }
      row = { id: identity.userId, role: "admin", disabled: false };
      await auth.users.upsert(row);
    }
    if (row.disabled) throw new ForbiddenError("Account disabled");

    c.set("user", { id: identity.userId, email: identity.email, role: row.role });
    return next();
  });
}

export function adminGuard(auth: AuthDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user || !isAdmin(user, auth.adminEmails)) throw new ForbiddenError("Admin only");
    return next();
  });
}
