import { parseArgs } from "node:util";
import { postgresUrlTarget, sqliteTarget } from "../src/compose-scripts.ts";
import type { ScriptOptions, ScriptTarget } from "../src/owner-script.ts";

export async function runProjectScript(
  name: string,
  note: string,
  run: (target: ScriptTarget, options: ScriptOptions) => Promise<void>,
): Promise<void> {
  const { values } = parseArgs({
    options: {
      sqlite: { type: "string" },
      postgres: { type: "boolean", default: false },
      owner: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const usage = `usage: ${name} (--sqlite <path> | --postgres [--owner <uuid>]) [--apply]\n  ${note}`;

  let target: ScriptTarget;
  if (values.sqlite && !values.postgres) {
    target = sqliteTarget(values.sqlite, { apply: values.apply });
  } else if (values.postgres && !values.sqlite && process.env.DATABASE_URL) {
    target = postgresUrlTarget(process.env.DATABASE_URL, values.owner);
  } else {
    const noUrl = values.postgres && !values.sqlite && !process.env.DATABASE_URL;
    console.error(noUrl ? `DATABASE_URL is not set\n${usage}` : usage);
    process.exit(1);
  }
  await run(target, { apply: values.apply, log: (line) => console.log(line) });
}
