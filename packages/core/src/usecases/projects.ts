import type { StoredBook } from "../domain/book.ts";
import { NotFoundError } from "../domain/errors.ts";
import { compareVolumes, type Project, unnumberedVolumeNumber } from "../domain/project.ts";
import { parseVolumeTitle } from "../domain/volume-title.ts";
import type { BookRepository, ProjectRepository } from "../ports/stores.ts";
import {
  type FullyTranslatedDeps,
  projectProgress,
  type VolumeProgress,
} from "./fully-translated.ts";

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
  /** The target language every volume is completely translated into, if any. */
  fullyTranslatedLang: string | null;
  /** Per volume id, the preferred target language that volume is completely translated into. */
  volumeLangs: Map<string, string | null>;
  mainLang: string | null;
  translatedVolumeCount: number;
  volumePercents: Map<string, number | null>;
}

type OverviewDeps = ProjectDeps & FullyTranslatedDeps;

async function overview(deps: OverviewDeps, entry: ProjectWithBooks): Promise<ProjectOverview> {
  const progress = await projectProgress(deps, entry.books);
  const perBook = <T>(pick: (v: VolumeProgress) => T) =>
    new Map(
      entry.books.map((b, i) => {
        const v = progress.volumes[i];
        return [b.id, v ? pick(v) : null] as const;
      }),
    );
  return {
    ...entry,
    fullyTranslatedLang: progress.fullyTranslatedLang,
    mainLang: progress.mainLang,
    translatedVolumeCount: progress.translatedVolumeCount,
    volumeLangs: perBook((v) => v.completeLangs[0] ?? null),
    volumePercents: perBook((v) => v.translatedPercent),
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
