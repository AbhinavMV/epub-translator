import { randomUUID } from "node:crypto";
import { runProjectBackfill } from "../src/backfill-projects.ts";
import { runProjectScript } from "./project-script.ts";

await runProjectScript("backfill-projects", "--postgres reads DATABASE_URL", (target, options) =>
  runProjectBackfill(target, { ...options, ids: { next: () => randomUUID() } }),
);
