import { AcceptInviteBodySchema } from "@et/contracts";
import { acceptInvite } from "@et/core";
import { Hono } from "hono";
import type { AuthDeps } from "./auth.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

export function clientKey(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

export function invitesRoutes(auth: AuthDeps) {
  return new Hono<AppEnv>().post("/accept", validate("json", AcceptInviteBodySchema), async (c) => {
    const body = c.req.valid("json");
    await acceptInvite(auth, { ...body, clientKey: clientKey(c.req.raw.headers) });
    return c.json({ ok: true }, 201);
  });
}
