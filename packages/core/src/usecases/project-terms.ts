import type {
  GlossaryConflict,
  GlossaryEntry,
  ProjectSettings,
  ProjectTerms,
  ResolveGlossaryConflict,
} from "@et/contracts";
import { NotFoundError } from "../domain/errors.ts";
import type {
  BookRepository,
  ProjectRepository,
  ProjectSettingsRepository,
} from "../ports/stores.ts";

const EMPTY: ProjectSettings = { customPrompt: "", glossary: [], glossaryConflicts: [] };

interface TermsDeps {
  books: BookRepository;
  projectSettings: ProjectSettingsRepository;
}

type SettingsDeps = Pick<TermsDeps, "projectSettings"> & { projects: ProjectRepository };

export async function projectTermsFor(deps: TermsDeps, bookId: string): Promise<ProjectTerms> {
  const book = await deps.books.get(bookId);
  const settings = book?.projectId ? await deps.projectSettings.get(book.projectId) : null;
  return {
    customPrompt: settings?.customPrompt ?? "",
    glossary: settings?.glossary ?? [],
  };
}

export async function getProjectSettings(
  deps: SettingsDeps,
  projectId: string,
): Promise<ProjectSettings> {
  if (!(await deps.projects.get(projectId))) throw new NotFoundError("Project", projectId);
  return (await deps.projectSettings.get(projectId)) ?? structuredClone(EMPTY);
}

export async function updateProjectTerms(
  deps: SettingsDeps,
  projectId: string,
  terms: ProjectTerms,
): Promise<ProjectSettings> {
  const current = await getProjectSettings(deps, projectId);
  const next = {
    customPrompt: terms.customPrompt,
    glossary: terms.glossary,
    glossaryConflicts: current.glossaryConflicts.filter((c) => stillOpen(c, terms.glossary)),
  };
  await deps.projectSettings.put(projectId, next);
  return next;
}

const stillOpen = (conflict: GlossaryConflict, glossary: GlossaryEntry[]) =>
  glossary.some((e) => e.source === conflict.source && e.target === conflict.inForce.target);

export async function resolveGlossaryConflict(
  deps: SettingsDeps,
  projectId: string,
  { source, target }: ResolveGlossaryConflict,
): Promise<ProjectSettings> {
  const current = await getProjectSettings(deps, projectId);
  const conflict = current.glossaryConflicts.find((c) => c.source === source);
  if (!conflict) throw new NotFoundError("Glossary conflict", source);
  const picked = [conflict.inForce, ...conflict.alternatives].find((r) => r.target === target);
  if (!picked) throw new NotFoundError("Rendering", target);
  const entry: GlossaryEntry = { source, target, ...(picked.note ? { note: picked.note } : {}) };
  const next = {
    ...current,
    glossary: current.glossary.map((e) => (e.source === source ? entry : e)),
    glossaryConflicts: current.glossaryConflicts.filter((c) => c !== conflict),
  };
  await deps.projectSettings.put(projectId, next);
  return next;
}
