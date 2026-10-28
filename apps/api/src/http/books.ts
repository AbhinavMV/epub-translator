import { BookSettingsSchema, SuggestGlossaryBodySchema } from "@et/contracts";
import {
  type BlobStore,
  deleteBook,
  getOrCreateWorkspace,
  InvalidEpubError,
  importBook,
  loadBookBytes,
  NotFoundError,
  type ParsedBook,
  ProviderNotConfiguredError,
  type Repositories,
  renderChapter,
  requireBook,
  suggestGlossary,
  translatedTitles,
} from "@et/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Services } from "../services.ts";
import { assetUrl, bookDetail, bookSummary } from "./presenters.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

const LIBRARY_TITLE_LANG = "en";

async function libraryTitle(
  repos: Repositories,
  bookId: string,
  parsed: ParsedBook,
): Promise<string | null> {
  const job = await repos.jobs.findByBookAndLang(bookId, LIBRARY_TITLE_LANG);
  return job ? translatedTitles(parsed, await repos.translations.forJob(job.id)).book : null;
}

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const ImportBodySchema = z.object({ path: z.string().min(1).max(300) });

export function booksRoutes(s: Services) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const { books } = c.var.repos;
      const summaries = [];
      for (const book of await books.list()) {
        const parsed = await books.getParsed(book.id);
        if (parsed) {
          summaries.push(
            bookSummary(book, parsed, await libraryTitle(c.var.repos, book.id, parsed)),
          );
        }
      }
      return c.json(summaries);
    })
    .post("/import", validate("json", ImportBodySchema), async (c) => {
      const uploads = s.uploads;
      if (!uploads) return c.json({ error: "Not found" }, 404);
      const { ownerId, blobs } = c.var;
      const { path } = c.req.valid("json");
      const { books } = c.var.repos;
      try {
        const bytes = await uploads.read(ownerId, path);
        const book = await importBook(
          {
            ...s,
            books,
            blobs: {
              get: (key) => blobs.get(key),
              delete: (key) => blobs.delete(key),
              put: (key) => uploads.promote(ownerId, path, `${ownerId}/${key}`, bytes),
            },
          },
          bytes,
        );
        return c.json(bookSummary(book, (await requireBook(books, book.id)).parsed), 201);
      } finally {
        await uploads.discard(ownerId, path).catch(() => undefined);
      }
    })
    .post(
      "/",
      bodyLimit({
        maxSize: MAX_UPLOAD_BYTES,
        onError: (c) => c.json({ error: "File too large (max 200 MB)" }, 413),
      }),
      async (c) => {
        if (s.uploads) return c.json({ error: "Not found" }, 404);
        const body = await c.req.parseBody();
        const file = body.file;
        if (!(file instanceof File)) throw new InvalidEpubError("Missing file field");
        const { books } = c.var.repos;
        const book = await importBook(
          { ...s, books, blobs: c.var.blobs },
          new Uint8Array(await file.arrayBuffer()),
        );
        return c.json(bookSummary(book, (await requireBook(books, book.id)).parsed), 201);
      },
    )
    .get("/:id", async (c) => {
      const id = c.req.param("id");
      const { book, parsed } = await requireBook(c.var.repos.books, id);
      return c.json(
        bookDetail(
          book,
          parsed,
          await c.var.repos.settings.get(id),
          await libraryTitle(c.var.repos, id, parsed),
        ),
      );
    })
    .delete("/:id", async (c) => {
      const { ownerId } = c.var;
      await deleteBook(
        {
          ...s,
          ...c.var.repos,
          blobs: c.var.blobs,
          runner: { cancel: (jobId) => s.runner.cancel(ownerId, jobId) },
        },
        c.req.param("id"),
      );
      return c.body(null, 204);
    })
    .put("/:id/settings", validate("json", BookSettingsSchema), async (c) => {
      const id = c.req.param("id");
      await requireBook(c.var.repos.books, id);
      const settings = c.req.valid("json");
      await c.var.repos.settings.put(id, settings);
      return c.json(settings);
    })
    .post("/:id/glossary/suggest", validate("json", SuggestGlossaryBodySchema), async (c) => {
      const body = c.req.valid("json");
      const extractor = s.providers.termExtractor(body.provider);
      if (!extractor) throw new ProviderNotConfiguredError(body.provider);
      const { terms, usage } = await suggestGlossary(
        { ...c.var.repos, extractor },
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
      async (c) => {
        const job = await getOrCreateWorkspace(
          { ...s, ...c.var.repos },
          c.req.param("id"),
          c.req.valid("query").targetLang,
        );
        return c.json(await s.runner.summary(c.var.ownerId, job.id));
      },
    )
    .get("/:id/chapters/:chapterId", async (c) => {
      const bookId = c.req.param("id");
      const view = await renderChapter(
        { ...s, ...c.var.repos, blobs: c.var.blobs },
        {
          bookId,
          jobId: c.req.query("jobId") || null,
          chapterId: c.req.param("chapterId"),
          assetUrl: assetUrl(bookId),
        },
      );
      return c.json(view);
    })
    .get("/:id/cover", async (c) => {
      const { book } = await requireBook(c.var.repos.books, c.req.param("id"));
      if (!book.coverHref) throw new NotFoundError("Cover", book.id);
      return serveAsset(s, c.var.repos, c.var.blobs, book.id, book.coverHref);
    })
    .get("/:id/assets/*", async (c) => {
      const id = c.req.param("id");
      const prefix = `/api/books/${id}/assets/`;
      const href = decodeURIComponent(c.req.path.slice(c.req.path.indexOf(prefix) + prefix.length));
      return serveAsset(s, c.var.repos, c.var.blobs, id, href);
    });
}

const INLINE_MEDIA = /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|font\/[\w.+-]+|text\/css)$/;
const ASSET_CSP = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

async function serveAsset(
  s: Services,
  repos: Repositories,
  blobs: BlobStore,
  bookId: string,
  href: string,
): Promise<Response> {
  const { book } = await requireBook(repos.books, bookId);
  const asset = await s.assets.read(await loadBookBytes(blobs, book), href);
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
