import type { ParsedBook, StoredBook } from "@et/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Database,
  openDatabase,
  SqliteBookRepository,
  SqliteBookSettingsRepository,
  SqliteJobRepository,
  SqliteTranslationRepository,
} from "../src/index.ts";

const book: StoredBook = {
  id: "b1",
  sha256: "abc",
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  createdAt: "2026-10-23T00:00:00.000Z",
};
const parsed: ParsedBook = {
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  chapters: [{ id: "ch-0", index: 0, title: "第一章", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "こんにちは" }],
};

let db: Database;
beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("SqliteBookRepository", () => {
  it("round-trips a book and its parsed structure", () => {
    const repo = new SqliteBookRepository(db);
    repo.insert(book, parsed);
    expect(repo.get("b1")).toEqual(book);
    expect(repo.getParsed("b1")).toEqual(parsed);
    expect(repo.findBySha256("abc")?.id).toBe("b1");
    expect(repo.list()).toEqual([book]);
  });

  it("caches the parsed structure and forgets it on delete", () => {
    const repo = new SqliteBookRepository(db);
    repo.insert(book, parsed);
    expect(repo.getParsed("b1")).toBe(repo.getParsed("b1"));
    repo.delete("b1");
    expect(repo.getParsed("b1")).toBeNull();
  });

  it("delete cascades to jobs and translations", () => {
    const books = new SqliteBookRepository(db);
    const jobs = new SqliteJobRepository(db);
    const translations = new SqliteTranslationRepository(db);
    books.insert(book, parsed);
    jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    translations.put("j1", "a.xhtml#0", { text: "Hello", status: "done" });
    books.delete("b1");
    expect(books.get("b1")).toBeNull();
    expect(jobs.get("j1")).toBeNull();
    expect(translations.forJob("j1").size).toBe(0);
  });
});

describe("SqliteBookSettingsRepository", () => {
  it("returns defaults until settings are saved", () => {
    new SqliteBookRepository(db).insert(book, parsed);
    const repo = new SqliteBookSettingsRepository(db);
    expect(repo.get("b1")).toEqual({ customPrompt: "", glossary: [], provider: null, model: null });
    const s = {
      customPrompt: "Keep honorifics",
      glossary: [{ source: "シャル", target: "Charlotte" }],
      provider: "anthropic" as const,
      model: "claude-sonnet-5-5",
    };
    repo.put("b1", s);
    expect(repo.get("b1")).toEqual(s);
  });
});

describe("SqliteJobRepository", () => {
  it("finds by book and language and accumulates usage", () => {
    new SqliteBookRepository(db).insert(book, parsed);
    const jobs = new SqliteJobRepository(db);
    jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    expect(jobs.findByBookAndLang("b1", "en")?.id).toBe("j1");
    expect(jobs.findByBookAndLang("b1", "fr")).toBeNull();
    jobs.addUsage("j1", { inputTokens: 10, outputTokens: 5 });
    jobs.addUsage("j1", { inputTokens: 1, outputTokens: 2 });
    jobs.update("j1", { error: "boom" });
    expect(jobs.get("j1")).toMatchObject({
      error: "boom",
      usage: { inputTokens: 11, outputTokens: 7 },
    });
    expect(jobs.listByBook("b1")).toHaveLength(1);
  });
});

describe("SqliteTranslationRepository", () => {
  it("upserts and deletes segment translations", () => {
    new SqliteBookRepository(db).insert(book, parsed);
    new SqliteJobRepository(db).insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    const repo = new SqliteTranslationRepository(db);
    repo.put("j1", "s1", { text: "a", status: "flagged" });
    repo.put("j1", "s1", { text: "b", status: "done" });
    repo.put("j1", "s2", { text: "c", status: "done" });
    expect(repo.get("j1", "s1")).toEqual({ text: "b", status: "done" });
    repo.deleteMany("j1", ["s1"]);
    expect([...repo.forJob("j1").keys()]).toEqual(["s2"]);
  });
});
