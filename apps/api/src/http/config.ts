import type { PublicConfig } from "@et/contracts";
import { Hono } from "hono";

export const LOCAL_PUBLIC_CONFIG: PublicConfig = { authMode: "none", clientExecution: false };

export function configRoutes(config: PublicConfig) {
  return new Hono().get("/", (c) => c.json(config));
}
