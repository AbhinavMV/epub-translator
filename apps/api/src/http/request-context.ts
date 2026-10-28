import type { AppRole } from "@et/contracts";
import type { Repositories } from "@et/core";
import { createMiddleware } from "hono/factory";
import type { Services } from "../services.ts";

export interface AuthedUser {
  id: string;
  email: string;
  role: AppRole;
}

export interface AppEnv {
  Variables: {
    ownerId: string;
    repos: Repositories;
    user?: AuthedUser;
  };
}

export function requestContext(services: Services, authEnabled = false) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (authEnabled && !c.var.user) return next();
    const ownerId = c.var.user?.id ?? (await services.ownerOf(c.req.raw));
    c.set("ownerId", ownerId);
    c.set("repos", services.factory.forOwner(ownerId));
    await next();
  });
}
