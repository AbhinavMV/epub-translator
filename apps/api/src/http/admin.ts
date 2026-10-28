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
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthDeps, adminGuard } from "./auth.ts";
import { requireUser } from "./auth-user.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

const idParam = zValidator("param", z.object({ id: z.uuid() }), (result, c) => {
  if (!result.success) return c.json({ error: "Not found" }, 404);
});

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
    .delete("/invites/:id", idParam, async (c) => {
      await auth.invites.revoke(c.req.param("id"));
      return c.body(null, 204);
    })
    .get("/users", async (c) => {
      const users: UserSummary[] = await listUsers(userDeps);
      return c.json(users);
    })
    .post("/users/:id/disable", idParam, async (c) => {
      await disableUser(userDeps, { actorId: requireUser(c).id, userId: c.req.param("id") });
      return c.body(null, 204);
    })
    .post("/users/:id/enable", idParam, async (c) => {
      await enableUser(userDeps, { actorId: requireUser(c).id, userId: c.req.param("id") });
      return c.body(null, 204);
    })
    .post("/users/:id/reset-link", idParam, async (c) => {
      const link: RecoveryLink = { link: await recoveryLinkFor(userDeps, c.req.param("id")) };
      return c.json(link);
    })
    .delete("/users/:id", idParam, async (c) => {
      await deleteUser(userDeps, { actorId: requireUser(c).id, userId: c.req.param("id") });
      return c.body(null, 204);
    });
}
