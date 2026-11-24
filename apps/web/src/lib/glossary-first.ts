import type { ProjectDetail } from "@et/contracts";
import { volumeProgress } from "./progress-status";

export function needsGlossaryFirst(
  project: Pick<ProjectDetail, "books" | "fullyTranslatedLang" | "mainLang">,
  glossarySize: number,
  skipped: boolean,
): boolean {
  return (
    !skipped &&
    glossarySize === 0 &&
    !project.fullyTranslatedLang &&
    project.books.some((b) => !volumeProgress(b, project.mainLang).done)
  );
}
