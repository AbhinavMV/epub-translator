import { describe, expect, it } from "vitest";
import {
  libraryBookTitle,
  type ParsedBook,
  type SegmentTranslation,
  translatedTitles,
} from "../../src/index.ts";
import { MemoryStoreFactory } from "./fakes.ts";

const seg = (id: string, sourceText: string, chapterId = "ch-contents") => ({
  id,
  chapterId,
  ordinal: 0,
  sourceText,
});

const book: ParsedBook = {
  title: "迷子の本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [
    { id: "ch-0", index: 0, title: "Front matter", docHrefs: ["a.xhtml"] },
    { id: "ch-1", index: 1, title: "第一章 & 始まり", docHrefs: ["b.xhtml"] },
    { id: "ch-2", index: 2, title: "第二章", docHrefs: ["c.xhtml"] },
    { id: "ch-3", index: 3, title: "第二章", docHrefs: ["d.xhtml"] },
    { id: "ch-contents", index: -1, title: "Contents", docHrefs: ["nav.xhtml"] },
  ],
  segments: [
    seg("opf#title", "迷子の本"),
    seg("opf#creator-0", "著者"),
    seg("nav.xhtml#0", "目次"),
    seg("nav.xhtml#1", "第一章 &amp; <1>始まり</1>"),
    seg("nav.xhtml#2", "第二章"),
    seg("nav.xhtml#3", "第二章"),
    seg("ncx#0", "第一章 &amp; 始まり"),
    seg("ncx#1", "第二章"),
    seg("ncx#2", "第二章"),
  ],
};

const done = (text: string): SegmentTranslation => ({ text, status: "done" });

describe("translatedTitles", () => {
  it("maps the book title and each chapter to its translated nav label", () => {
    const t = new Map([
      ["opf#title", done("A Lost Book")],
      ["nav.xhtml#1", done("Chapter 1 &amp; <1>Start</1>")],
      ["nav.xhtml#2", done("Chapter 2")],
      ["nav.xhtml#3", done("Chapter 3")],
    ]);
    expect(translatedTitles(book, t)).toEqual({
      book: "A Lost Book",
      chapters: { "ch-1": "Chapter 1 & Start", "ch-2": "Chapter 2", "ch-3": "Chapter 3" },
    });
  });

  it("falls back to ncx labels when the nav label is untranslated", () => {
    const t = new Map([["ncx#0", done("Chapter 1")]]);
    expect(translatedTitles(book, t).chapters).toEqual({ "ch-1": "Chapter 1" });
  });

  it("uses flagged translations and ignores failed and pending ones", () => {
    const t = new Map<string, SegmentTranslation>([
      ["opf#title", { text: "Flagged", status: "flagged" }],
      ["nav.xhtml#1", { text: "x", status: "failed" }],
    ]);
    expect(translatedTitles(book, t)).toEqual({ book: "Flagged", chapters: {} });
  });

  it("is empty when nothing is translated", () => {
    expect(translatedTitles(book, new Map())).toEqual({ book: null, chapters: {} });
  });
});

describe("libraryBookTitle", () => {
  it("reads only the Contents chapter's segments of the English job", async () => {
    const repos = new MemoryStoreFactory().local();
    await repos.jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "t",
    });
    await repos.translations.put("j1", "opf#title", done("Lost Book"));
    await repos.translations.put("j1", "x", done("not asked"));
    repos.translations.resetCalls();
    expect(await libraryBookTitle(repos, "b1", book)).toBe("Lost Book");
    expect(repos.translations.forJobCalls).toEqual([]);
    const asked = repos.translations.forSegmentsCalls.flat();
    expect(asked).toContain("opf#title");
    expect(asked).not.toContain("x");
    expect(asked.sort()).toEqual(
      book.segments
        .filter((s) => s.chapterId === "ch-contents")
        .map((s) => s.id)
        .sort(),
    );
  });

  it("is null without an English job", async () => {
    const repos = new MemoryStoreFactory().local();
    expect(await libraryBookTitle(repos, "b1", book)).toBeNull();
  });
});
