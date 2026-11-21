import type { ParsedBook, StoredBook } from "../domain/book.ts";
import { NotFoundError } from "../domain/errors.ts";
import { type Project, unnumberedVolumeNumber } from "../domain/project.ts";
import { parseVolumeTitle } from "../domain/volume-title.ts";
import type { EpubParser } from "../ports/epub.ts";
import type { BlobStore, BookRepository, ProjectRepository } from "../ports/stores.ts";
import type { Clock, Hasher, IdGenerator } from "../ports/system.ts";

export interface ImportBookDeps {
  books: BookRepository;
  projects: ProjectRepository;
  blobs: BlobStore;
  parser: EpubParser;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
}

export type ImportPlacement = ({ projectId: string } | { projectName: string }) & {
  volumeNumber: number | null;
};

export type ImportPreview =
  | { kind: "duplicate"; book: StoredBook }
  | {
      kind: "new";
      title: string;
      seriesTitle: string;
      volumeNumber: number | null;
      project: Project | null;
    };

export function bookBlobKey(sha256: string): string {
  return `books/${sha256}.epub`;
}

async function suggestProject(
  deps: Pick<ImportBookDeps, "books" | "projects">,
  seriesTitle: string,
): Promise<Project | null> {
  if (!seriesTitle) return null;
  for (const book of await deps.books.list()) {
    if (book.projectId && parseVolumeTitle(book.title).seriesTitle === seriesTitle) {
      return deps.projects.get(book.projectId);
    }
  }
  return null;
}

export async function previewImport(
  deps: Omit<ImportBookDeps, "ids" | "clock">,
  bytes: Uint8Array,
): Promise<ImportPreview> {
  const existing = await deps.books.findBySha256(await deps.hasher.sha256(bytes));
  if (existing) return { kind: "duplicate", book: existing };
  const parsed = await deps.parser.parse(bytes);
  const { seriesTitle, volumeNumber } = parseVolumeTitle(parsed.title);
  return {
    kind: "new",
    title: parsed.title,
    seriesTitle,
    volumeNumber,
    project: await suggestProject(deps, seriesTitle),
  };
}

async function resolvePlacement(
  deps: ImportBookDeps,
  parsed: ParsedBook,
  placement: ImportPlacement | undefined,
  createdAt: string,
): Promise<{ project: Project; created: boolean; volumeNumber: number }> {
  const { seriesTitle, volumeNumber: parsedVolume } = parseVolumeTitle(parsed.title);
  let project: Project | null;
  if (!placement) {
    project = await suggestProject(deps, seriesTitle);
  } else if ("projectId" in placement) {
    project = await deps.projects.get(placement.projectId);
    if (!project) throw new NotFoundError("Project", placement.projectId);
  } else {
    project = null;
  }
  const volumeNumber = placement?.volumeNumber ?? parsedVolume;
  if (project) {
    const existing = await deps.books.listByProject(project.id);
    return {
      project,
      created: false,
      volumeNumber: volumeNumber ?? unnumberedVolumeNumber(existing.map((b) => b.volumeNumber)),
    };
  }
  const name = placement && "projectName" in placement ? placement.projectName.trim() : seriesTitle;
  return {
    project: { id: deps.ids.next(), name: name || parsed.title, createdAt },
    created: true,
    volumeNumber: volumeNumber ?? unnumberedVolumeNumber([]),
  };
}

export async function importBook(
  deps: ImportBookDeps,
  bytes: Uint8Array,
  placement?: ImportPlacement,
): Promise<StoredBook> {
  const sha256 = await deps.hasher.sha256(bytes);
  const existing = await deps.books.findBySha256(sha256);
  if (existing) return existing;

  const parsed = await deps.parser.parse(bytes);
  const createdAt = deps.clock.now().toISOString();
  const bookId = deps.ids.next();
  const { project, created, volumeNumber } = await resolvePlacement(
    deps,
    parsed,
    placement,
    createdAt,
  );
  const book: StoredBook = {
    id: bookId,
    sha256,
    title: parsed.title,
    author: parsed.author,
    sourceLang: parsed.sourceLang,
    coverHref: parsed.coverHref,
    createdAt,
    projectId: project.id,
    volumeNumber,
  };
  await deps.blobs.put(bookBlobKey(sha256), bytes);
  if (created) await deps.projects.create(project);
  const stored = await deps.books.insertIfAbsent(book, parsed);
  if (stored.id !== book.id && created) await deps.projects.delete(project.id);
  return stored;
}
