import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE, SESSION_COOKIE_PATH } from "./auth.ts";
import type { AppEnv } from "./request-context.ts";

const SESSION_MAX_AGE_SECONDS = 3600;

export function sessionRoutes() {
  return new Hono<AppEnv>()
    .post("/", (c) => {
      const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        path: SESSION_COOKIE_PATH,
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
      return c.body(null, 204);
    })
    .delete("/", (c) => {
      deleteCookie(c, SESSION_COOKIE, { path: SESSION_COOKIE_PATH, secure: true });
      return c.body(null, 204);
    });
}
