import { backfillProjects, describeBackfillPlan, type IdGenerator } from "@et/core";
import { runPerOwner, type ScriptOptions, type ScriptTarget } from "./owner-script.ts";

export function runProjectBackfill(
  target: ScriptTarget,
  options: ScriptOptions & { ids: IdGenerator },
): Promise<void> {
  return runPerOwner(target, options, async (repos) =>
    describeBackfillPlan(
      await backfillProjects({ ...repos, ids: options.ids }, { apply: options.apply }),
    ),
  );
}
