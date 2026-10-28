import { Hono } from "hono";
import { createApp } from "./app.ts";
import { composeHosted } from "./compose-hosted.ts";

let app: ReturnType<typeof createApp> | undefined;

function hostedApp() {
  if (!app) {
    const { services, options } = composeHosted(process.env);
    app = createApp(services, options);
  }
  return app;
}

export default new Hono().all("*", (c) => {
  try {
    return hostedApp().fetch(c.req.raw);
  } catch (err) {
    console.error(`[api] hosted startup failed: ${err instanceof Error ? err.message : "unknown"}`);
    return c.json({ error: "Server is not configured" }, 500);
  }
});
