import { ExportQuerySchema, TranslateBodySchema } from "@et/contracts";
import { exportEpub, exportText } from "@et/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Services } from "../services.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

const HEARTBEAT_MS = 15_000;

function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const EPUB_TYPE = "application/epub+zip";
const TEXT_TYPE = "text/plain; charset=utf-8";

export interface JobsRouteOptions {
  events?: boolean;
}

export function jobsRoutes(s: Services, options: JobsRouteOptions = {}) {
  return new Hono<AppEnv>()
    .get("/:id", async (c) => c.json(await s.runner.summary(c.var.ownerId, c.req.param("id"))))
    .post(
      "/:id/chapters/:chapterId/translate",
      validate("json", TranslateBodySchema),
      async (c) => {
        const id = c.req.param("id");
        await s.runner.translateChapter(
          c.var.ownerId,
          id,
          c.req.param("chapterId"),
          c.req.valid("json"),
        );
        return c.json(await s.runner.summary(c.var.ownerId, id));
      },
    )
    .post("/:id/chapters/:chapterId/retry", validate("json", TranslateBodySchema), async (c) => {
      const id = c.req.param("id");
      await s.runner.retryChapter(c.var.ownerId, id, c.req.param("chapterId"), c.req.valid("json"));
      return c.json(await s.runner.summary(c.var.ownerId, id));
    })
    .post("/:id/chapters/:chapterId/clear", async (c) => {
      const id = c.req.param("id");
      await s.runner.clearChapter(c.var.ownerId, id, c.req.param("chapterId"));
      return c.json(await s.runner.summary(c.var.ownerId, id));
    })
    .post("/:id/translate-all", validate("json", TranslateBodySchema), async (c) => {
      const id = c.req.param("id");
      await s.runner.translateAll(c.var.ownerId, id, c.req.valid("json"));
      return c.json(await s.runner.summary(c.var.ownerId, id));
    })
    .post("/:id/cancel", async (c) => {
      const id = c.req.param("id");
      await s.runner.cancel(c.var.ownerId, id);
      return c.json(await s.runner.summary(c.var.ownerId, id));
    })
    .get("/:id/export", validate("query", ExportQuerySchema), async (c) => {
      const jobId = c.req.param("id");
      const { layout } = c.req.valid("query");
      const { filename, bytes } = await exportEpub(
        { ...s, ...c.var.repos, blobs: c.var.blobs },
        jobId,
        layout,
      );
      if (s.exports) {
        const url = await s.exports.publish(c.var.ownerId, {
          name: `${jobId}-${layout}.epub`,
          bytes,
          contentType: EPUB_TYPE,
          downloadName: filename,
        });
        return c.json(url);
      }
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "application/epub+zip",
          "content-disposition": attachment(filename),
        },
      });
    })
    .get("/:id/export.txt", async (c) => {
      const jobId = c.req.param("id");
      const { filename, text } = await exportText(c.var.repos, jobId);
      if (s.exports) {
        const url = await s.exports.publish(c.var.ownerId, {
          name: `${jobId}-translation.txt`,
          bytes: new TextEncoder().encode(text),
          contentType: TEXT_TYPE,
          downloadName: filename,
        });
        return c.json(url);
      }
      return new Response(text, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": attachment(filename),
        },
      });
    })
    .get("/:id/events", async (c) => {
      if (options.events === false) return c.json({ error: "Not found" }, 404);
      const id = c.req.param("id");
      const initial = await s.runner.summary(c.var.ownerId, id);
      return streamSSE(c, async (stream) => {
        const closed = new Promise<void>((resolve) => stream.onAbort(resolve));
        let seq = 0;
        const send = (data: unknown) =>
          stream.writeSSE({ id: String(++seq), data: JSON.stringify(data) });
        const unsubscribe = s.events.subscribe(id, (event) => {
          void send(event);
        });
        const heartbeat = setInterval(() => {
          void stream.write(": ping\n\n");
        }, HEARTBEAT_MS);
        await send({ type: "job.status", job: initial });
        await closed;
        clearInterval(heartbeat);
        unsubscribe();
      });
    });
}
