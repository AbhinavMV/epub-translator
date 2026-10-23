import { BookSettingsSchema, SuggestGlossaryBodySchema } from "@et/contracts";
import {
  deleteBook,
  getOrCreateWorkspace,
  InvalidEpubError,
  importBook,
  loadBookBytes,
  NotFoundError,
  ProviderNotConfiguredError,
  renderChapter,
  requireBook,
  suggestGlossary,
} from "@et/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Services } from "../services.ts";
import { assetUrl, bookDetail, bookSummary } from "./presenters.ts";
import { validate } from "./validate.ts";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export function booksRoutes(s: Services) {
  return new Hono()
    .get("/", (c) =>
      c.json(
        s.books.list().flatMap((book) => {
          const parsed = s.books.getParsed(book.id);
          return parsed ? [bookSummary(book, parsed)] : [];
        }),
      ),
    )
    .post(
      "/",
      bodyLimit({
        maxSize: MAX_UPLOAD_BYTES,
        onError: (c) => c.json({ error: "File too large (max 200 MB)" }, 413),
      }),
      async (c) => {
        const body = await c.req.parseBody();
        const file = body.file;
        if (!(file instanceof File)) throw new InvalidEpubError("Missing file field");
        const book = await importBook(s, new Uint8Array(await file.arrayBuffer()));
        return c.json(bookSummary(book, requireBook(s.books, book.id).parsed), 201);
      },
    )
    .get("/:id", (c) => {
      const id = c.req.param("id");
      const { book, parsed } = requireBook(s.books, id);
      return c.json(bookDetail(book, parsed, s.settings.get(id)));
    })
    .delete("/:id", async (c) => {
      await deleteBook(s, c.req.param("id"));
      return c.body(null, 204);
    })
    .put("/:id/settings", validate("json", BookSettingsSchema), (c) => {
      const id = c.req.param("id");
      requireBook(s.books, id);
      const settings = c.req.valid("json");
      s.settings.put(id, settings);
      return c.json(settings);
    })
    .post("/:id/glossary/suggest", validate("json", SuggestGlossaryBodySchema), async (c) => {
      const body = c.req.valid("json");
      const extractor = s.providers.termExtractor(body.provider);
      if (!extractor) throw new ProviderNotConfiguredError(body.provider);
      const { terms, usage } = await suggestGlossary(
        { books: s.books, settings: s.settings, jobs: s.jobs, extractor },
        { bookId: c.req.param("id"), model: body.model, targetLang: body.targetLang ?? "en" },
        c.req.raw.signal,
      );
      c.header("x-usage-input-tokens", String(usage.inputTokens));
      c.header("x-usage-output-tokens", String(usage.outputTokens));
      return c.json(terms);
    })
    .get(
      "/:id/workspace",
      validate("query", z.object({ targetLang: z.string().default("en") })),
      (c) => {
        const job = getOrCreateWorkspace(s, c.req.param("id"), c.req.valid("query").targetLang);
        return c.json(s.runner.summary(job.id));
      },
    )
    .get("/:id/chapters/:chapterId", async (c) => {
      const bookId = c.req.param("id");
      const view = await renderChapter(s, {
        bookId,
        jobId: c.req.query("jobId") || null,
        chapterId: c.req.param("chapterId"),
        assetUrl: assetUrl(bookId),
      });
      return c.json(view);
    })
    .get("/:id/cover", async (c) => {
      const { book } = requireBook(s.books, c.req.param("id"));
      if (!book.coverHref) throw new NotFoundError("Cover", book.id);
      return serveAsset(s, book.id, book.coverHref);
    })
    .get("/:id/assets/*", async (c) => {
      const id = c.req.param("id");
      const prefix = `/api/books/${id}/assets/`;
      const href = decodeURIComponent(c.req.path.slice(c.req.path.indexOf(prefix) + prefix.length));
      return serveAsset(s, id, href);
    });
}

const INLINE_MEDIA = /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|font\/[\w.+-]+|text\/css)$/;
const ASSET_CSP = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

async function serveAsset(s: Services, bookId: string, href: string): Promise<Response> {
  const { book } = requireBook(s.books, bookId);
  const asset = await s.assets.read(await loadBookBytes(s.blobs, book), href);
  if (!asset) throw new NotFoundError("Asset", href);
  const inline = INLINE_MEDIA.test(asset.mediaType);
  const headers: Record<string, string> = {
    "content-type": inline ? asset.mediaType : "application/octet-stream",
    "content-security-policy": ASSET_CSP,
    "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
  };
  if (!inline) headers["content-disposition"] = "attachment";
  return new Response(new Uint8Array(asset.bytes), { headers });
}
