import { beforeEach, describe, expect, it } from "vitest";
import {
  bookBlobKey,
  PARSER_VERSION,
  type ParsedBook,
  refreshParsedBooks,
} from "../../src/index.ts";
import {
  MemoryBlobs,
  MemoryBooks,
  MemoryJobs,
  MemoryTranslations,
  StubParser,
  sampleParsed,
} from "./fakes.ts";

const stored = (id: string, sha256: string) => ({
  id,
  sha256,
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  createdAt: "",
  projectId: "p1",
  volumeNumber: 1,
});

let books: MemoryBooks;
let blobs: MemoryBlobs;
let jobs: MemoryJobs;
let translations: MemoryTranslations;
const deps = () => ({ books, blobs, jobs, translations });

beforeEach(async () => {
  books = new MemoryBooks();
  blobs = new MemoryBlobs();
  jobs = new MemoryJobs();
  translations = new MemoryTranslations();
  await blobs.put(bookBlobKey("old"), new Uint8Array([1]));
  await blobs.put(bookBlobKey("new"), new Uint8Array([2]));
});

describe("refreshParsedBooks", () => {
  it("re-parses books stored by an older parser and keeps their segment ids", async () => {
    await books.insert(stored("b-old", "old"), { ...sampleParsed });
    const upgraded: ParsedBook = {
      ...sampleParsed,
      parserVersion: PARSER_VERSION,
      segments: [
        ...sampleParsed.segments,
        { id: "opf#creator-0", chapterId: "ch-1", ordinal: 1, sourceText: "著者" },
      ],
    };
    const result = await refreshParsedBooks({ ...deps(), parser: new StubParser(upgraded) });
    expect(result).toEqual({ upgraded: 1, failed: 0 });
    const after = (await books.getParsed("b-old")) as ParsedBook;
    expect(after.parserVersion).toBe(PARSER_VERSION);
    for (const s of sampleParsed.segments) {
      expect(after.segments.map((x) => x.id)).toContain(s.id);
    }
  });

  it("drops translations of segments the re-parsed book no longer has", async () => {
    await books.insert(stored("b-old", "old"), { ...sampleParsed });
    const [kept, dropped] = sampleParsed.segments;
    await jobs.insert({
      id: "j1",
      bookId: "b-old",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "",
    });
    await translations.put("j1", kept?.id ?? "", { text: "kept", status: "done" });
    await translations.put("j1", dropped?.id ?? "", { text: "gone", status: "done" });
    const upgraded: ParsedBook = {
      ...sampleParsed,
      parserVersion: PARSER_VERSION,
      segments: sampleParsed.segments.filter((s) => s.id !== dropped?.id),
    };
    await refreshParsedBooks({ ...deps(), parser: new StubParser(upgraded) });
    expect([...(await translations.forJob("j1")).keys()]).toEqual([kept?.id]);
  });

  it("leaves books already at the current parser version alone", async () => {
    await books.insert(stored("b-new", "new"), { ...sampleParsed, parserVersion: PARSER_VERSION });
    const parser = new StubParser();
    expect(await refreshParsedBooks({ ...deps(), parser })).toEqual({ upgraded: 0, failed: 0 });
    expect(parser.calls).toBe(0);
  });

  it("keeps the old parse and counts a failure when a book no longer parses", async () => {
    await books.insert(stored("b-old", "old"), sampleParsed);
    const parser = new StubParser(new Error("bad"));
    expect(await refreshParsedBooks({ ...deps(), parser })).toEqual({ upgraded: 0, failed: 1 });
    expect(await books.getParsed("b-old")).toBe(sampleParsed);
  });
});
