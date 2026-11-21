import type { StoredBook } from "../domain/book.ts";
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

export function bookBlobKey(sha256: string): string {
  return `books/${sha256}.epub`;
}

export async function importBook(deps: ImportBookDeps, bytes: Uint8Array): Promise<StoredBook> {
  const sha256 = await deps.hasher.sha256(bytes);
  const existing = await deps.books.findBySha256(sha256);
  if (existing) return existing;

  const parsed = await deps.parser.parse(bytes);
  const createdAt = deps.clock.now().toISOString();
  const bookId = deps.ids.next();
  const { seriesTitle, volumeNumber } = parseVolumeTitle(parsed.title);
  const project = { id: deps.ids.next(), name: seriesTitle || parsed.title, createdAt };
  const book: StoredBook = {
    id: bookId,
    sha256,
    title: parsed.title,
    author: parsed.author,
    sourceLang: parsed.sourceLang,
    coverHref: parsed.coverHref,
    createdAt,
    projectId: project.id,
    volumeNumber: volumeNumber ?? 1,
  };
  await deps.blobs.put(bookBlobKey(sha256), bytes);
  await deps.projects.create(project);
  const stored = await deps.books.insertIfAbsent(book, parsed);
  if (stored.id !== book.id) await deps.projects.delete(project.id);
  return stored;
}
