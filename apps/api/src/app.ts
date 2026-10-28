import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { booksRoutes } from "./http/books.ts";
import { handleError } from "./http/errors.ts";
import { jobsRoutes } from "./http/jobs.ts";
import { providersRoutes } from "./http/providers.ts";
import { type AppEnv, requestContext } from "./http/request-context.ts";
import type { Services } from "./services.ts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "");
}

export const isLoopbackHost = (host: string): boolean => LOCAL_HOSTS.has(hostname(host));

export interface AppOptions {
  allowHost?: (host: string) => boolean;
}

export function createApp(services: Services, options: AppOptions = {}) {
  const allowHost = options.allowHost ?? isLoopbackHost;
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      // The local api binds to loopback; a foreign Host header means a DNS-rebinding page.
      if (!allowHost(c.req.header("host") ?? new URL(c.req.url).host)) {
        return c.json({ error: "Forbidden host" }, 403);
      }
      await next();
    })
    .use(secureHeaders())
    .onError(handleError)
    .use("/api/*", requestContext(services))
    .route("/api/books", booksRoutes(services))
    .route("/api/jobs", jobsRoutes(services))
    .route("/api/providers", providersRoutes(services))
    .notFound((c) => c.json({ error: "Not found" }, 404));
}
