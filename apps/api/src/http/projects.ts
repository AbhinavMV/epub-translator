import { RenameProjectBodySchema } from "@et/contracts";
import {
  deleteProject,
  libraryBookTitle,
  listProjectOverviews,
  projectOverview,
  type Repositories,
  renameProject,
  type StoredBook,
} from "@et/core";
import { Hono } from "hono";
import type { Services } from "../services.ts";
import { bookSummary, projectSummary } from "./presenters.ts";
import type { AppEnv } from "./request-context.ts";
import { validate } from "./validate.ts";

async function summaries(repos: Repositories, books: StoredBook[]) {
  const result = await Promise.all(
    books.map(async (book) => {
      const parsed = await repos.books.getParsed(book.id);
      if (!parsed) return null;
      return bookSummary(book, parsed, await libraryBookTitle(repos, book.id, parsed));
    }),
  );
  return result.filter((summary) => summary !== null);
}

export function projectsRoutes(s: Services) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const overviews = await listProjectOverviews(c.var.repos);
      return c.json(overviews.map(projectSummary));
    })
    .get("/:id", async (c) => {
      const { repos } = c.var;
      const { project, books, fullyTranslatedLang } = await projectOverview(
        repos,
        c.req.param("id"),
      );
      return c.json({ ...project, books: await summaries(repos, books), fullyTranslatedLang });
    })
    .patch("/:id", validate("json", RenameProjectBodySchema), async (c) => {
      const project = await renameProject(c.var.repos, c.req.param("id"), c.req.valid("json").name);
      return c.json(project);
    })
    .delete("/:id", async (c) => {
      const { ownerId } = c.var;
      await deleteProject(
        {
          ...c.var.repos,
          blobs: c.var.blobs,
          runner: { cancel: (jobId) => s.runner.cancel(ownerId, jobId) },
        },
        c.req.param("id"),
      );
      return c.body(null, 204);
    });
}
