import { LOCAL_OWNER_ID } from "@et/contracts";
import { refreshParsedBooks } from "@et/core";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { composeLocalServices } from "./compose-local.ts";
import { loadConfig } from "./config.ts";
import { LOCAL_PUBLIC_CONFIG } from "./http/config.ts";
import { startBatchPolling } from "./infra/batch-poller.ts";

const config = loadConfig(process.env);
const services = composeLocalServices({ dataDir: config.dataDir, env: config.env });
const refreshed = await refreshParsedBooks({ ...services, ...services.repos });
if (refreshed.upgraded + refreshed.failed > 0) {
  console.log(`[api] re-parsed ${refreshed.upgraded} book(s), ${refreshed.failed} failed`);
}
const server = serve(
  {
    fetch: createApp(services, {
      config: { ...LOCAL_PUBLIC_CONFIG, clientExecution: config.env.CLIENT_EXECUTION === "1" },
    }).fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(`[api] listening on http://${info.address}:${info.port} (data: ${config.dataDir})`);
  },
);
const stopPolling = startBatchPolling(
  () => services.runner.pollBatches(LOCAL_OWNER_ID),
  config.batchPollIntervalMs,
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopPolling();
    server.close();
    services.db.close();
    process.exit(0);
  });
}
