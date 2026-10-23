import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { booksRoutes } from "./http/books.ts";
import { handleError } from "./http/errors.ts";
import { jobsRoutes } from "./http/jobs.ts";
import { providersRoutes } from "./http/providers.ts";
import type { Services } from "./services.ts";

export function createApp(services: Services) {
  return new Hono()
    .use(secureHeaders())
    .onError(handleError)
    .route("/api/books", booksRoutes(services))
    .route("/api/jobs", jobsRoutes(services))
    .route("/api/providers", providersRoutes(services))
    .notFound((c) => c.json({ error: "Not found" }, 404));
}
