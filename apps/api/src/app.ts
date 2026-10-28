import type { PublicConfig } from "@et/contracts";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { adminRoutes } from "./http/admin.ts";
import { type AuthDeps, authMiddleware } from "./http/auth.ts";
import { meRoutes } from "./http/auth-routes.ts";
import { booksRoutes } from "./http/books.ts";
import { configRoutes, LOCAL_PUBLIC_CONFIG, publicConfig } from "./http/config.ts";
import { handleError } from "./http/errors.ts";
import { invitesRoutes } from "./http/invites.ts";
import { jobsRoutes } from "./http/jobs.ts";
import { providersRoutes } from "./http/providers.ts";
import { type AppEnv, requestContext } from "./http/request-context.ts";
import { sessionRoutes } from "./http/session.ts";
import { glossarySampleRoutes, workRoutes } from "./http/work.ts";
import type { Services } from "./services.ts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "");
}

export const isLoopbackHost = (host: string): boolean => LOCAL_HOSTS.has(hostname(host));

export function allowedHostsPolicy(list: string): (host: string) => boolean {
  const allowed = new Set(
    list
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
  return (host) => allowed.has(host.toLowerCase()) || allowed.has(hostname(host).toLowerCase());
}

export interface AppOptions {
  allowHost?: (host: string) => boolean;
  auth?: AuthDeps;
  config?: PublicConfig;
  events?: boolean;
}

export function createApp(services: Services, options: AppOptions = {}) {
  const allowHost = options.allowHost ?? isLoopbackHost;
  const { auth } = options;
  const app = new Hono<AppEnv>()
    .use(async (c, next) => {
      // The local api binds to loopback; a foreign Host header means a DNS-rebinding page.
      if (!allowHost(c.req.header("host") ?? new URL(c.req.url).host)) {
        return c.json({ error: "Forbidden host" }, 403);
      }
      await next();
    })
    .use(secureHeaders())
    .onError(handleError);

  if (auth) {
    app.use("/api/*", async (c, next) => {
      await next();
      if (!c.res.headers.has("cache-control")) c.header("Cache-Control", "no-store");
    });
  }

  app.route("/api/config", configRoutes(publicConfig(options.config ?? LOCAL_PUBLIC_CONFIG, auth)));
  app
    .use("/api/*", authMiddleware(auth))
    .use("/api/*", requestContext(services, auth !== undefined));
  if (auth) {
    app
      .route("/api/me", meRoutes(auth))
      .route("/api/session", sessionRoutes())
      .route("/api/invites", invitesRoutes(auth))
      .route("/api/admin", adminRoutes(auth));
  }
  return app
    .route("/api/books", booksRoutes(services))
    .route("/api/books", glossarySampleRoutes())
    .route("/api/jobs", jobsRoutes(services, { events: options.events ?? true }))
    .route("/api/jobs", workRoutes(services))
    .route("/api/providers", providersRoutes(services))
    .notFound((c) => c.json({ error: "Not found" }, 404));
}
