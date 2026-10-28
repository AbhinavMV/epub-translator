import { UnauthorizedError } from "@et/core";
import type { Context } from "hono";
import type { AppEnv, AuthedUser } from "./request-context.ts";

export function requireUser(c: Context<AppEnv>): AuthedUser {
  const user = c.var.user;
  if (!user) throw new UnauthorizedError();
  return user;
}
