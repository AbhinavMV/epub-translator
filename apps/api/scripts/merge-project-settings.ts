import { runProjectSettingsMerge } from "../src/merge-project-settings.ts";
import { runProjectScript } from "./project-script.ts";

await runProjectScript(
  "merge-project-settings",
  "--postgres reads DATABASE_URL; run backfill:projects first",
  runProjectSettingsMerge,
);
