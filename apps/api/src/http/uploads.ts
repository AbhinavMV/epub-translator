import { RateLimitedError } from "@et/core";
import { Hono } from "hono";
import type { Services } from "../services.ts";
import type { AppEnv } from "./request-context.ts";

export function uploadsRoutes(s: Services) {
  return new Hono<AppEnv>().post("/", async (c) => {
    if (!s.uploads) return c.json({ error: "Not found" }, 404);
    if (s.uploadLimiter && !(await s.uploadLimiter.allow(`upload:${c.var.ownerId}`))) {
      throw new RateLimitedError();
    }
    return c.json(await s.uploads.create(c.var.ownerId));
  });
}
