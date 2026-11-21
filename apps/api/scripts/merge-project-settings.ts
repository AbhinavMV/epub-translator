import { parseArgs } from "node:util";
import { createPostgresSql } from "@et/store-postgres";
import { type BackfillTarget, postgresBackfill, sqliteBackfill } from "../src/backfill-projects.ts";
import { runProjectSettingsMerge } from "../src/merge-project-settings.ts";

const { values } = parseArgs({
  options: {
    sqlite: { type: "string" },
    postgres: { type: "boolean", default: false },
    owner: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});

const usage =
  "usage: merge-project-settings (--sqlite <path> | --postgres [--owner <uuid>]) [--apply]\n" +
  "  --postgres reads DATABASE_URL; run backfill:projects first";

let target: BackfillTarget;
let end = async () => {};
if (values.sqlite && !values.postgres) {
  target = sqliteBackfill(values.sqlite, { apply: values.apply });
} else if (values.postgres && !values.sqlite) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`DATABASE_URL is not set\n${usage}`);
    process.exit(1);
  }
  const sql = createPostgresSql(url);
  end = () => sql.end();
  target = postgresBackfill(sql, values.owner);
} else {
  console.error(usage);
  process.exit(1);
}

try {
  await runProjectSettingsMerge(target, {
    apply: values.apply,
    log: (line) => console.log(line),
  });
} finally {
  await end();
}
