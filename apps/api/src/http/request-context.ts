import type { Repositories } from "@et/core";
import { createMiddleware } from "hono/factory";
import type { Services } from "../services.ts";

export interface AppEnv {
  Variables: {
    ownerId: string;
    repos: Repositories;
  };
}

export function requestContext(services: Services) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const ownerId = await services.ownerOf(c.req.raw);
    c.set("ownerId", ownerId);
    c.set("repos", services.factory.forOwner(ownerId));
    await next();
  });
}
