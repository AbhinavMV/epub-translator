import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { composeServices } from "./compose.ts";
import { loadConfig } from "./config.ts";
import { startBatchPolling } from "./infra/batch-poller.ts";

const config = loadConfig(process.env);
const services = composeServices({ dataDir: config.dataDir, env: config.env });
const server = serve(
  { fetch: createApp(services).fetch, port: config.port, hostname: config.host },
  (info) => {
    console.log(`[api] listening on http://${info.address}:${info.port} (data: ${config.dataDir})`);
  },
);
const stopPolling = startBatchPolling(services.runner, config.batchPollIntervalMs);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopPolling();
    server.close();
    services.db.close();
    process.exit(0);
  });
}
