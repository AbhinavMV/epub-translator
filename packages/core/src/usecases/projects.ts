import type { StoredBook } from "../domain/book.ts";
import { NotFoundError } from "../domain/errors.ts";
import { compareVolumes, type Project, unnumberedVolumeNumber } from "../domain/project.ts";
import { parseVolumeTitle } from "../domain/volume-title.ts";
import type { BookRepository, ProjectRepository } from "../ports/stores.ts";
import {
  type ProjectProgressDeps,
  type ProjectProgressSummary,
  projectProgress,
  type VolumeProgress,
} from "./project-progress.ts";

export interface ProjectWithBooks {
  project: Project;
  books: StoredBook[];
}

interface ProjectDeps {
  projects: ProjectRepository;
  books: BookRepository;
}

export async function listProjects(deps: ProjectDeps): Promise<ProjectWithBooks[]> {
  const [projects, books] = await Promise.all([deps.projects.list(), deps.books.list()]);
  const byProject = new Map<string, StoredBook[]>();
  for (const book of books) {
    if (!book.projectId) continue;
    byProject.set(book.projectId, [...(byProject.get(book.projectId) ?? []), book]);
  }
  return projects.map((project) => ({
    project,
    books: (byProject.get(project.id) ?? []).sort(compareVolumes),
  }));
}

export async function requireProject(
  deps: ProjectDeps,
  projectId: string,
): Promise<ProjectWithBooks> {
  const project = await deps.projects.get(projectId);
  if (!project) throw new NotFoundError("Project", projectId);
  return { project, books: await deps.books.listByProject(projectId) };
}

export interface ProjectOverview extends ProjectWithBooks {
  progress: ProjectProgressSummary;
  /** Per volume id. */
  volumes: Map<string, VolumeProgress>;
}

type OverviewDeps = ProjectDeps & ProjectProgressDeps;

async function overview(deps: OverviewDeps, entry: ProjectWithBooks): Promise<ProjectOverview> {
  const { volumes, ...progress } = await projectProgress(deps, entry.books);
  return {
    ...entry,
    progress,
    volumes: new Map(
      entry.books.flatMap((b, i) => {
        const v = volumes[i];
        return v ? [[b.id, v] as const] : [];
      }),
    ),
  };
}

export async function listProjectOverviews(deps: OverviewDeps): Promise<ProjectOverview[]> {
  return Promise.all((await listProjects(deps)).map((entry) => overview(deps, entry)));
}

export async function projectOverview(
  deps: OverviewDeps,
  projectId: string,
): Promise<ProjectOverview> {
  return overview(deps, await requireProject(deps, projectId));
}

export async function setVolumeNumber(
  deps: Pick<ProjectDeps, "books">,
  bookId: string,
  volumeNumber: number,
): Promise<StoredBook> {
  const book = await deps.books.get(bookId);
  if (!book?.projectId) throw new NotFoundError("Book", bookId);
  await deps.books.place(bookId, book.projectId, volumeNumber);
  return { ...book, volumeNumber };
}

export async function moveBook(
  deps: ProjectDeps,
  bookId: string,
  projectId: string,
): Promise<StoredBook> {
  const book = await deps.books.get(bookId);
  if (!book) throw new NotFoundError("Book", bookId);
  const project = await deps.projects.get(projectId);
  if (!project) throw new NotFoundError("Project", projectId);
  if (book.projectId === projectId) return book;
  const existing = await deps.books.listByProject(projectId);
  const parsed = parseVolumeTitle(book.title);
  const volumeNumber =
    parsed.volumeNumber ?? unnumberedVolumeNumber(existing.map((b) => b.volumeNumber));
  await deps.books.place(bookId, projectId, volumeNumber);
  if (parsed.seriesTitle) await deps.projects.adoptSeriesTitle(projectId, parsed.seriesTitle);
  return { ...book, projectId, volumeNumber };
}

export async function renameProject(
  deps: Pick<ProjectDeps, "projects">,
  projectId: string,
  name: string,
): Promise<Project> {
  const project = await deps.projects.get(projectId);
  if (!project) throw new NotFoundError("Project", projectId);
  const trimmed = name.trim();
  await deps.projects.rename(projectId, trimmed);
  return { ...project, name: trimmed };
}
