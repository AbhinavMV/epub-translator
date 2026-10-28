import { Hono } from "hono";
import type { Services } from "../services.ts";
import type { AppEnv } from "./request-context.ts";

export function providersRoutes(s: Services) {
  return new Hono<AppEnv>().get("/", async (c) => c.json(await s.providers.list()));
}
