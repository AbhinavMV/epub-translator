import { describeMergePlan, mergeProjectSettings } from "@et/core";
import { runPerOwner, type ScriptOptions, type ScriptTarget } from "./owner-script.ts";

export function runProjectSettingsMerge(
  target: ScriptTarget,
  options: ScriptOptions,
): Promise<void> {
  return runPerOwner(target, options, async (repos) =>
    describeMergePlan(await mergeProjectSettings(repos, { apply: options.apply })),
  );
}
