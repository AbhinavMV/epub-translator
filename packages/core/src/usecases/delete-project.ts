import type { ProjectRepository } from "../ports/stores.ts";
import { type DeleteBookDeps, deleteBook } from "./delete-book.ts";
import { requireProject } from "./projects.ts";

export interface DeleteProjectDeps extends DeleteBookDeps {
  projects: ProjectRepository;
}

export async function deleteProject(deps: DeleteProjectDeps, projectId: string): Promise<void> {
  const { books } = await requireProject(deps, projectId);
  for (const book of books) await deleteBook(deps, book.id);
  await deps.projects.delete(projectId);
}
