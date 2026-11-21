import { describeMergePlan, mergeProjectSettings } from "@et/core";
import type { BackfillTarget } from "./backfill-projects.ts";

export async function runProjectSettingsMerge(
  target: BackfillTarget,
  options: { apply: boolean; log: (line: string) => void },
): Promise<void> {
  try {
    for (const ownerId of await target.ownerIds()) {
      options.log(`Owner ${ownerId}`);
      const plan = await mergeProjectSettings(target.factory.forOwner(ownerId), {
        apply: options.apply,
      });
      for (const line of describeMergePlan(plan)) options.log(line);
    }
    options.log(
      options.apply ? "Applied." : "Dry run: nothing was written. Re-run with --apply to write.",
    );
  } finally {
    target.close();
  }
}
