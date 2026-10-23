import { Hono } from "hono";
import type { Services } from "../services.ts";

export function providersRoutes(s: Services) {
  return new Hono().get("/", async (c) => c.json(await s.providers.list()));
}
