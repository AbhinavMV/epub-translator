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

export interface BackfillPlan {
  projects: BackfillProject[];
}

interface PlannedProject extends BackfillProject {
  createdAt: string;
}

function seriesOf(book: StoredBook) {
  const { seriesTitle, volumeNumber } = parseVolumeTitle(book.title);
  return { series: seriesTitle || book.title.trim(), volumeNumber: volumeNumber ?? 1 };
}

async function plan(deps: BackfillDeps): Promise<PlannedProject[]> {
  const books = await deps.books.list();
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
  const planned = await plan(deps);
  if (options.apply) {
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
      for (const placement of project.books) {
        await deps.books.place(placement.bookId, projectId, placement.volumeNumber);
      }
    }
  }
  return { projects: planned.map(({ createdAt: _, ...project }) => project) };
}

export function describeBackfillPlan(plan: BackfillPlan): string[] {
  const lines: string[] = [];
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
