import type { ProjectSettings, ProjectTerms } from "@et/contracts";
import { NotFoundError } from "../domain/errors.ts";
import type { BookRepository, ProjectRepository } from "../ports/stores.ts";

const EMPTY: ProjectSettings = { customPrompt: "", glossary: [], glossaryConflicts: [] };

interface TermsDeps {
  books: BookRepository;
  projects: ProjectRepository;
}

export async function projectTermsFor(deps: TermsDeps, bookId: string): Promise<ProjectTerms> {
  const book = await deps.books.get(bookId);
  const settings = book?.projectId ? await deps.projects.getSettings(book.projectId) : null;
  return {
    customPrompt: settings?.customPrompt ?? "",
    glossary: settings?.glossary ?? [],
  };
}

export async function getProjectSettings(
  deps: Pick<TermsDeps, "projects">,
  projectId: string,
): Promise<ProjectSettings> {
  if (!(await deps.projects.get(projectId))) throw new NotFoundError("Project", projectId);
  return (await deps.projects.getSettings(projectId)) ?? structuredClone(EMPTY);
}

export async function updateProjectTerms(
  deps: Pick<TermsDeps, "projects">,
  projectId: string,
  terms: ProjectTerms,
): Promise<ProjectSettings> {
  const current = await getProjectSettings(deps, projectId);
  const next = { ...current, customPrompt: terms.customPrompt, glossary: terms.glossary };
  await deps.projects.putSettings(projectId, next);
  return next;
}
