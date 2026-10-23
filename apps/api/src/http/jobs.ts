import { TranslateBodySchema } from "@et/contracts";
import { exportEpub, exportText } from "@et/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Services } from "../services.ts";
import { validate } from "./validate.ts";

const HEARTBEAT_MS = 15_000;

function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function jobsRoutes(s: Services) {
  return new Hono()
    .get("/:id", (c) => c.json(s.runner.summary(c.req.param("id"))))
    .post("/:id/chapters/:chapterId/translate", validate("json", TranslateBodySchema), (c) => {
      const id = c.req.param("id");
      s.runner.translateChapter(id, c.req.param("chapterId"), c.req.valid("json"));
      return c.json(s.runner.summary(id));
    })
    .post("/:id/chapters/:chapterId/retry", validate("json", TranslateBodySchema), (c) => {
      const id = c.req.param("id");
      s.runner.retryChapter(id, c.req.param("chapterId"), c.req.valid("json"));
      return c.json(s.runner.summary(id));
    })
    .post("/:id/chapters/:chapterId/clear", (c) => {
      const id = c.req.param("id");
      s.runner.clearChapter(id, c.req.param("chapterId"));
      return c.json(s.runner.summary(id));
    })
    .post("/:id/translate-all", validate("json", TranslateBodySchema), (c) => {
      const id = c.req.param("id");
      s.runner.translateAll(id, c.req.valid("json"));
      return c.json(s.runner.summary(id));
    })
    .post("/:id/cancel", (c) => {
      const id = c.req.param("id");
      s.runner.cancel(id);
      return c.json(s.runner.summary(id));
    })
    .get("/:id/export", async (c) => {
      const { filename, bytes } = await exportEpub(s, c.req.param("id"));
      return new Response(bytes, {
        headers: {
          "content-type": "application/epub+zip",
          "content-disposition": attachment(filename),
        },
      });
    })
    .get("/:id/export.txt", (c) => {
      const { filename, text } = exportText(s, c.req.param("id"));
      return new Response(text, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-disposition": attachment(filename),
        },
      });
    })
    .get("/:id/events", (c) => {
      const id = c.req.param("id");
      const initial = s.runner.summary(id);
      return streamSSE(c, async (stream) => {
        let seq = 0;
        const send = (data: unknown) =>
          stream.writeSSE({ id: String(++seq), data: JSON.stringify(data) });
        await send({ type: "job.status", job: initial });
        const unsubscribe = s.events.subscribe(id, (event) => {
          void send(event);
        });
        const heartbeat = setInterval(() => {
          void stream.write(": ping\n\n");
        }, HEARTBEAT_MS);
        await new Promise<void>((resolve) => stream.onAbort(resolve));
        clearInterval(heartbeat);
        unsubscribe();
      });
    });
}
