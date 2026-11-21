import { ProjectTermsSchema, ResolveGlossaryConflictSchema } from "@et/contracts";
import { getProjectSettings, resolveGlossaryConflict, updateProjectTerms } from "@et/core";
import { Hono } from "hono";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

export function projectSettingsRoutes() {
  return new Hono<AppEnv>()
    .get("/:id/settings", async (c) =>
      c.json(await getProjectSettings(c.var.repos, c.req.param("id"))),
    )
    .put("/:id/settings", validate("json", ProjectTermsSchema), async (c) =>
      c.json(await updateProjectTerms(c.var.repos, c.req.param("id"), c.req.valid("json"))),
    )
    .post(
      "/:id/glossary-conflicts/resolve",
      validate("json", ResolveGlossaryConflictSchema),
      async (c) =>
        c.json(await resolveGlossaryConflict(c.var.repos, c.req.param("id"), c.req.valid("json"))),
    );
}
