import type { StoredBook } from "../domain/book.ts";
import { compareVolumes } from "../domain/project.ts";
import { parseVolumeTitle } from "../domain/volume-title.ts";
import type { BookRepository, ProjectRepository } from "../ports/stores.ts";
import type { IdGenerator } from "../ports/system.ts";

export interface BackfillDeps {
  books: BookRepository;
  projects: ProjectRepository;
  ids: IdGenerator;
}

export interface BackfillPlacement {
  bookId: string;
  title: string;
  volumeNumber: number;
}

export interface BackfillProject {
  projectId: string | null;
  name: string;
  books: BackfillPlacement[];
}

export interface BackfillSeriesTitle {
  projectId: string;
  name: string;
  seriesTitle: string;
}

export interface BackfillPlan {
  projects: BackfillProject[];
  seriesTitles: BackfillSeriesTitle[];
}

interface PlannedProject extends BackfillProject {
  createdAt: string;
  seriesTitle: string | null;
}

const parsedSeries = (book: StoredBook) => parseVolumeTitle(book.title).seriesTitle;

function seriesOf(book: StoredBook) {
  const { seriesTitle, volumeNumber } = parseVolumeTitle(book.title);
  return { series: seriesTitle || book.title.trim(), volumeNumber: volumeNumber ?? 1 };
}

async function missingSeriesTitles(
  deps: BackfillDeps,
  books: readonly StoredBook[],
): Promise<BackfillSeriesTitle[]> {
  const firstSeries = new Map<string, string>();
  for (const book of [...books].sort(compareVolumes)) {
    const series = parsedSeries(book);
    if (book.projectId && series && !firstSeries.has(book.projectId)) {
      firstSeries.set(book.projectId, series);
    }
  }
  const missing: BackfillSeriesTitle[] = [];
  for (const [projectId, seriesTitle] of firstSeries) {
    if (await deps.projects.seriesTitle(projectId)) continue;
    const project = await deps.projects.get(projectId);
    if (project) missing.push({ projectId, name: project.name, seriesTitle });
  }
  return missing;
}

async function plan(deps: BackfillDeps, books: readonly StoredBook[]): Promise<PlannedProject[]> {
  const existing = new Map<string, string>();
  for (const book of [...books].sort(compareVolumes)) {
    const { series } = seriesOf(book);
    if (book.projectId && !existing.has(series)) existing.set(series, book.projectId);
  }

  const groups = new Map<string, StoredBook[]>();
  for (const book of books) {
    if (book.projectId) continue;
    const { series } = seriesOf(book);
    groups.set(series, [...(groups.get(series) ?? []), book]);
  }

  const planned: PlannedProject[] = [];
  for (const [series, members] of groups) {
    const projectId = existing.get(series) ?? null;
    const project = projectId ? await deps.projects.get(projectId) : null;
    planned.push({
      projectId,
      name: project?.name ?? series,
      seriesTitle: members.map(parsedSeries).find(Boolean) || null,
      createdAt: members.map((b) => b.createdAt).sort()[0] ?? "",
      books: members
        .map((book) => ({
          bookId: book.id,
          title: book.title,
          volumeNumber: seriesOf(book).volumeNumber,
          createdAt: book.createdAt,
        }))
        .sort(compareVolumes)
        .map(({ createdAt: _, ...placement }) => placement),
    });
  }
  return planned.sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name),
  );
}

export async function backfillProjects(
  deps: BackfillDeps,
  options: { apply: boolean },
): Promise<BackfillPlan> {
  const books = await deps.books.list();
  const planned = await plan(deps, books);
  const seriesTitles = await missingSeriesTitles(deps, books);
  if (options.apply) {
    for (const fill of seriesTitles) {
      await deps.projects.adoptSeriesTitle(fill.projectId, fill.seriesTitle);
    }
    for (const project of planned) {
      let projectId = project.projectId;
      if (!projectId) {
        projectId = deps.ids.next();
        await deps.projects.create({
          id: projectId,
          name: project.name,
          createdAt: project.createdAt,
        });
      }
      if (project.seriesTitle) await deps.projects.adoptSeriesTitle(projectId, project.seriesTitle);
      for (const placement of project.books) {
        await deps.books.place(placement.bookId, projectId, placement.volumeNumber);
      }
    }
  }
  return {
    projects: planned.map(({ createdAt: _, seriesTitle: __, ...project }) => project),
    seriesTitles,
  };
}

export function describeBackfillPlan(plan: BackfillPlan): string[] {
  const lines: string[] = [];
  for (const fill of plan.seriesTitles) {
    lines.push(
      `Project "${fill.name}" (${fill.projectId}) takes series title "${fill.seriesTitle}".`,
    );
  }
  for (const project of plan.projects) {
    lines.push(
      project.projectId
        ? `Existing project "${project.name}" (${project.projectId}) gains:`
        : `New project "${project.name}":`,
    );
    for (const book of project.books) {
      lines.push(`  vol ${book.volumeNumber}  ${book.title}  [${book.bookId}]`);
    }
  }
  const placed = plan.projects.reduce((n, p) => n + p.books.length, 0);
  const created = plan.projects.filter((p) => !p.projectId).length;
  lines.push(
    placed === 0
      ? "Every book already belongs to a project."
      : `${placed} book(s) into ${created} new project(s) and ${plan.projects.length - created} existing project(s).`,
  );
  return lines;
}
