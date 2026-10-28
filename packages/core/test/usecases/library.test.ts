import { describe, expect, it } from "vitest";
import {
  deleteBook,
  exportEpub,
  getOrCreateWorkspace,
  InvalidEpubError,
  importBook,
  NotFoundError,
  renderChapter,
} from "../../src/index.ts";
import {
  counterIds,
  fakeHasher,
  fixedClock,
  MemoryBlobs,
  MemoryBooks,
  MemoryJobs,
  MemoryTranslations,
  RecordingExporter,
  RecordingRenderer,
  StubParser,
} from "./fakes.ts";

const bytes = new Uint8Array([1, 2, 3]);

function libraryDeps(parser = new StubParser()) {
  return {
    books: new MemoryBooks(),
    blobs: new MemoryBlobs(),
    parser,
    hasher: fakeHasher,
    ids: counterIds("b"),
    clock: fixedClock,
  };
}

describe("importBook", () => {
  it("stores the bytes and parsed structure", async () => {
    const deps = libraryDeps();
    const book = await importBook(deps, bytes);
    expect(book).toMatchObject({
      id: "b1",
      title: "本",
      author: "著者",
      sourceLang: "ja",
      sha256: "sha-3-1",
    });
    expect(deps.blobs.rows.get("books/sha-3-1.epub")).toEqual(bytes);
    expect((await deps.books.getParsed("b1"))?.segments).toHaveLength(3);
  });

  it("is idempotent by sha256", async () => {
    const deps = libraryDeps();
    const a = await importBook(deps, bytes);
    const b = await importBook(deps, bytes);
    expect(b.id).toBe(a.id);
    expect(deps.parser.calls).toBe(1);
  });

  it("propagates InvalidEpubError without storing anything", async () => {
    const deps = libraryDeps(new StubParser(new InvalidEpubError("bad")));
    await expect(importBook(deps, bytes)).rejects.toBeInstanceOf(InvalidEpubError);
    expect(deps.blobs.rows.size).toBe(0);
    expect(await deps.books.list()).toHaveLength(0);
  });
});

describe("deleteBook", () => {
  it("cancels the book's translation jobs before deleting", async () => {
    const deps = libraryDeps();
    const book = await importBook(deps, bytes);
    const jobs = new MemoryJobs();
    const job = await getOrCreateWorkspace(
      { books: deps.books, jobs, ids: counterIds("j"), clock: fixedClock },
      book.id,
      "en",
    );
    const cancelled: string[] = [];
    await deleteBook(
      { ...deps, jobs, runner: { cancel: async (id) => void cancelled.push(id) } },
      book.id,
    );
    expect(cancelled).toEqual([job.id]);
  });

  it("removes the row and the blob", async () => {
    const deps = libraryDeps();
    const book = await importBook(deps, bytes);
    await deleteBook(
      { ...deps, jobs: new MemoryJobs(), runner: { cancel: async () => {} } },
      book.id,
    );
    expect(await deps.books.get(book.id)).toBeNull();
    expect(deps.blobs.rows.size).toBe(0);
  });
});

describe("getOrCreateWorkspace", () => {
  it("creates one job per book and language and reuses it", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    const deps = {
      books: lib.books,
      jobs: new MemoryJobs(),
      ids: counterIds("j"),
      clock: fixedClock,
    };
    const a = await getOrCreateWorkspace(deps, book.id, "en");
    const b = await getOrCreateWorkspace(deps, book.id, "en");
    expect(a.id).toBe("j1");
    expect(b.id).toBe("j1");
    expect(a).toMatchObject({ bookId: book.id, targetLang: "en", sourceLang: "ja" });
  });

  it("rejects unknown books", async () => {
    const deps = {
      books: new MemoryBooks(),
      jobs: new MemoryJobs(),
      ids: counterIds(),
      clock: fixedClock,
    };
    await expect(getOrCreateWorkspace(deps, "nope", "en")).rejects.toThrow(NotFoundError);
  });
});

describe("renderChapter", () => {
  it("passes the job's translations to the renderer", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    const translations = new MemoryTranslations();
    await translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    const renderer = new RecordingRenderer();
    const view = await renderChapter(
      { books: lib.books, blobs: lib.blobs, translations, renderer },
      { bookId: book.id, jobId: "j1", chapterId: "ch-0", assetUrl: (h) => h },
    );
    expect(view.title).toBe("第一章");
    expect(renderer.lastTranslations?.get("a.xhtml#0")?.text).toBe("One");
  });

  it("renders source only without a job", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    const renderer = new RecordingRenderer();
    await renderChapter(
      { books: lib.books, blobs: lib.blobs, translations: new MemoryTranslations(), renderer },
      { bookId: book.id, jobId: null, chapterId: "ch-0", assetUrl: (h) => h },
    );
    expect(renderer.lastTranslations?.size).toBe(0);
  });

  it("throws NotFoundError for unknown chapters", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    await expect(
      renderChapter(
        {
          books: lib.books,
          blobs: lib.blobs,
          translations: new MemoryTranslations(),
          renderer: new RecordingRenderer(),
        },
        { bookId: book.id, jobId: null, chapterId: "ch-9", assetUrl: (h) => h },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("exportEpub", () => {
  it("exports with the job's target language and a sanitized filename", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    const jobs = new MemoryJobs();
    const job = await getOrCreateWorkspace(
      { books: lib.books, jobs, ids: counterIds("j"), clock: fixedClock },
      book.id,
      "en",
    );
    const exporter = new RecordingExporter();
    const out = await exportEpub(
      {
        books: lib.books,
        jobs,
        blobs: lib.blobs,
        translations: new MemoryTranslations(),
        exporter,
      },
      job.id,
    );
    expect(exporter.lastTarget).toBe("en");
    expect(out.filename).toBe("本 (en).epub");
    expect(out.bytes.at(-1)).toBe(9);
    expect(exporter.lastLayout).toBe("translation");
  });

  it("names the file after the translated title when one exists", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    const jobs = new MemoryJobs();
    const job = await getOrCreateWorkspace(
      { books: lib.books, jobs, ids: counterIds("j"), clock: fixedClock },
      book.id,
      "en",
    );
    const translations = new MemoryTranslations();
    await translations.put(job.id, "opf#title", { text: "A <1>Lost</1> Book", status: "done" });
    const out = await exportEpub(
      { books: lib.books, jobs, blobs: lib.blobs, translations, exporter: new RecordingExporter() },
      job.id,
    );
    expect(out.filename).toBe("A Lost Book (en).epub");
  });

  it("bilingual layout reaches the exporter and marks the filename", async () => {
    const lib = libraryDeps();
    const book = await importBook(lib, bytes);
    const jobs = new MemoryJobs();
    const job = await getOrCreateWorkspace(
      { books: lib.books, jobs, ids: counterIds("j"), clock: fixedClock },
      book.id,
      "en",
    );
    const exporter = new RecordingExporter();
    const out = await exportEpub(
      {
        books: lib.books,
        jobs,
        blobs: lib.blobs,
        translations: new MemoryTranslations(),
        exporter,
      },
      job.id,
      "bilingual",
    );
    expect(exporter.lastLayout).toBe("bilingual");
    expect(out.filename).toBe("本 (en, bilingual).epub");
  });
});
