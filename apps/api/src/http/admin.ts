import {
  type CreatedInvite,
  CreateInviteBodySchema,
  type InviteSummary,
  type RecoveryLink,
  type UserSummary,
} from "@et/contracts";
import {
  createInvite,
  deleteUser,
  disableUser,
  enableUser,
  type Invite,
  listUsers,
  recoveryLinkFor,
} from "@et/core";
import { Hono } from "hono";
import { type AuthDeps, adminGuard } from "./auth.ts";
import { requireUser } from "./auth-user.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

function inviteSummary(invite: Invite, now: Date): InviteSummary {
  const status = invite.usedAt ? "used" : invite.expiresAt <= now ? "expired" : "pending";
  return {
    id: invite.id,
    email: invite.email,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    usedAt: invite.usedAt?.toISOString() ?? null,
    status,
  };
}

export function adminRoutes(auth: AuthDeps) {
  const userDeps = { users: auth.users, admin: auth.admin };
  return new Hono<AppEnv>()
    .use(adminGuard(auth))
    .post("/invites", validate("json", CreateInviteBodySchema), async (c) => {
      const body = c.req.valid("json");
      const { invite, token } = await createInvite(auth, {
        createdBy: requireUser(c).id,
        email: body.email,
        expiresInHours: body.expiresInHours,
      });
      const created: CreatedInvite = { invite: inviteSummary(invite, auth.clock.now()), token };
      return c.json(created, 201);
    })
    .get("/invites", async (c) => {
      const now = auth.clock.now();
      const rows = await auth.invites.list();
      return c.json(rows.map((r) => inviteSummary(r, now)));
    })
    .delete("/invites/:id", async (c) => {
      await auth.invites.revoke(c.req.param("id"));
      return c.body(null, 204);
    })
    .get("/users", async (c) => {
      const users: UserSummary[] = await listUsers(userDeps);
      return c.json(users);
    })
    .post("/users/:id/disable", async (c) => {
      await disableUser(userDeps, { actorId: requireUser(c).id, userId: c.req.param("id") });
      return c.body(null, 204);
    })
    .post("/users/:id/enable", async (c) => {
      await enableUser(userDeps, { actorId: requireUser(c).id, userId: c.req.param("id") });
      return c.body(null, 204);
    })
    .post("/users/:id/reset-link", async (c) => {
      const link: RecoveryLink = { link: await recoveryLinkFor(userDeps, c.req.param("id")) };
      return c.json(link);
    })
    .delete("/users/:id", async (c) => {
      await deleteUser(userDeps, { actorId: requireUser(c).id, userId: c.req.param("id") });
      return c.body(null, 204);
    });
}
