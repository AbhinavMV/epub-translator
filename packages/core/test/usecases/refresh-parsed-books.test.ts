import { beforeEach, describe, expect, it } from "vitest";
import {
  bookBlobKey,
  PARSER_VERSION,
  type ParsedBook,
  refreshParsedBooks,
} from "../../src/index.ts";
import { MemoryBlobs, MemoryBooks, StubParser, sampleParsed } from "./fakes.ts";

const stored = (id: string, sha256: string) => ({
  id,
  sha256,
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  createdAt: "",
});

let books: MemoryBooks;
let blobs: MemoryBlobs;

beforeEach(async () => {
  books = new MemoryBooks();
  blobs = new MemoryBlobs();
  await blobs.put(bookBlobKey("old"), new Uint8Array([1]));
  await blobs.put(bookBlobKey("new"), new Uint8Array([2]));
});

describe("refreshParsedBooks", () => {
  it("re-parses books stored by an older parser and keeps their segment ids", async () => {
    books.insert(stored("b-old", "old"), { ...sampleParsed });
    const upgraded: ParsedBook = {
      ...sampleParsed,
      parserVersion: PARSER_VERSION,
      segments: [
        ...sampleParsed.segments,
        { id: "opf#creator-0", chapterId: "ch-1", ordinal: 1, sourceText: "著者" },
      ],
    };
    const result = await refreshParsedBooks({ books, blobs, parser: new StubParser(upgraded) });
    expect(result).toEqual({ upgraded: 1, failed: 0 });
    const after = books.getParsed("b-old") as ParsedBook;
    expect(after.parserVersion).toBe(PARSER_VERSION);
    for (const s of sampleParsed.segments) {
      expect(after.segments.map((x) => x.id)).toContain(s.id);
    }
  });

  it("leaves books already at the current parser version alone", async () => {
    books.insert(stored("b-new", "new"), { ...sampleParsed, parserVersion: PARSER_VERSION });
    const parser = new StubParser();
    expect(await refreshParsedBooks({ books, blobs, parser })).toEqual({ upgraded: 0, failed: 0 });
    expect(parser.calls).toBe(0);
  });

  it("keeps the old parse and counts a failure when a book no longer parses", async () => {
    books.insert(stored("b-old", "old"), sampleParsed);
    const parser = new StubParser(new Error("bad"));
    expect(await refreshParsedBooks({ books, blobs, parser })).toEqual({ upgraded: 0, failed: 1 });
    expect(books.getParsed("b-old")).toBe(sampleParsed);
  });
});
