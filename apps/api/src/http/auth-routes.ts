import type { Me } from "@et/contracts";
import { Hono } from "hono";
import { type AuthDeps, isAdmin } from "./auth.ts";
import type { AppEnv } from "./request-context.ts";

export function meRoutes(auth: AuthDeps) {
  return new Hono<AppEnv>().get("/", (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const me: Me = { ...user, isAdmin: isAdmin(user, auth.adminEmails) };
    return c.json(me);
  });
}
