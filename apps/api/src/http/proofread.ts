import {
  ProofreadBodySchema,
  ProofreadDecisionBodySchema,
  RecordProofreadBodySchema,
} from "@et/contracts";
import {
  decideProofread,
  NotFoundError,
  ProviderNotConfiguredError,
  proofreadInput,
  proofreadSummaries,
  recordProofread,
  runProofread,
} from "@et/core";
import { Hono } from "hono";
import type { Services } from "../services.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

export function proofreadRoutes(s: Services) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.header("cache-control", "no-store");
      await next();
    })
    .get("/:id/proofreads", async (c) =>
      c.json(await proofreadSummaries(c.var.repos, c.req.param("id"))),
    )
    .get("/:id/chapters/:chapterId/proofread", async (c) => {
      const { id, chapterId } = c.req.param();
      const proofread = await c.var.repos.proofreads.get(id, chapterId);
      if (!proofread) throw new NotFoundError("Proofread", chapterId);
      return c.json(proofread);
    })
    .get("/:id/chapters/:chapterId/proofread/input", async (c) =>
      c.json(await proofreadInput(c.var.repos, c.req.param("id"), c.req.param("chapterId"))),
    )
    .post(
      "/:id/chapters/:chapterId/proofread",
      validate("json", ProofreadBodySchema),
      async (c) => {
        const body = c.req.valid("json");
        const proofreader = s.providers.proofreader(body.provider);
        if (!proofreader) throw new ProviderNotConfiguredError(body.provider);
        return c.json(
          await runProofread(
            { repos: c.var.repos, proofreader, sleep: s.sleep, clock: s.clock },
            {
              jobId: c.req.param("id"),
              chapterId: c.req.param("chapterId"),
              model: body.model,
              notes: body.notes,
            },
            c.req.raw.signal,
          ),
        );
      },
    )
    .put(
      "/:id/chapters/:chapterId/proofread",
      validate("json", RecordProofreadBodySchema),
      async (c) =>
        c.json(
          await recordProofread(c.var.repos, s.clock, {
            jobId: c.req.param("id"),
            chapterId: c.req.param("chapterId"),
            ...c.req.valid("json"),
          }),
        ),
    )
    .post(
      "/:id/chapters/:chapterId/proofread/decisions",
      validate("json", ProofreadDecisionBodySchema),
      async (c) =>
        c.json(
          await decideProofread(
            c.var.repos,
            c.req.param("id"),
            c.req.param("chapterId"),
            c.req.valid("json"),
          ),
        ),
    )
    .delete("/:id/chapters/:chapterId/proofread", async (c) => {
      await c.var.repos.proofreads.delete(c.req.param("id"), c.req.param("chapterId"));
      return c.body(null, 204);
    });
}
