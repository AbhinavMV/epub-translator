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
beforeEach(async () => {
  db = openDatabase(":memory:");
});

describe("SqliteBookRepository", () => {
  it("round-trips a book and its parsed structure", async () => {
    const repo = new SqliteBookRepository(db);
    await repo.insert(book, parsed);
    expect(await repo.get("b1")).toEqual(book);
    expect(await repo.getParsed("b1")).toEqual(parsed);
    expect((await repo.findBySha256("abc"))?.id).toBe("b1");
    expect(await repo.list()).toEqual([book]);
  });

  it("caches the parsed structure and forgets it on delete", async () => {
    const repo = new SqliteBookRepository(db);
    await repo.insert(book, parsed);
    expect(await repo.getParsed("b1")).toBe(await repo.getParsed("b1"));
    await repo.delete("b1");
    expect(await repo.getParsed("b1")).toBeNull();
  });

  it("updateParsed replaces the stored structure and the cache", async () => {
    const repo = new SqliteBookRepository(db);
    await repo.insert(book, parsed);
    await repo.getParsed("b1");
    const next = { ...parsed, parserVersion: 2 };
    await repo.updateParsed("b1", next);
    expect(await repo.getParsed("b1")).toEqual(next);
    expect(await new SqliteBookRepository(db).getParsed("b1")).toEqual(next);
  });

  it("delete cascades to jobs and translations", async () => {
    const books = new SqliteBookRepository(db);
    const jobs = new SqliteJobRepository(db);
    const translations = new SqliteTranslationRepository(db);
    await books.insert(book, parsed);
    await jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    await translations.put("j1", "a.xhtml#0", { text: "Hello", status: "done" });
    await books.delete("b1");
    expect(await books.get("b1")).toBeNull();
    expect(await jobs.get("j1")).toBeNull();
    expect((await translations.forJob("j1")).size).toBe(0);
  });
});

describe("SqliteBookSettingsRepository", () => {
  it("returns defaults until settings are saved", async () => {
    await new SqliteBookRepository(db).insert(book, parsed);
    const repo = new SqliteBookSettingsRepository(db);
    expect(await repo.get("b1")).toEqual({
      customPrompt: "",
      glossary: [],
      provider: null,
      model: null,
    });
    const s = {
      customPrompt: "Keep honorifics",
      glossary: [{ source: "シャル", target: "Charlotte" }],
      provider: "anthropic" as const,
      model: "claude-sonnet-5-5",
    };
    await repo.put("b1", s);
    expect(await repo.get("b1")).toEqual(s);
  });
});

describe("SqliteJobRepository", () => {
  it("finds by book and language and accumulates usage", async () => {
    await new SqliteBookRepository(db).insert(book, parsed);
    const jobs = new SqliteJobRepository(db);
    await jobs.insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    expect((await jobs.findByBookAndLang("b1", "en"))?.id).toBe("j1");
    expect(await jobs.findByBookAndLang("b1", "fr")).toBeNull();
    await jobs.addUsage("j1", { inputTokens: 10, outputTokens: 5 });
    await jobs.addUsage("j1", { inputTokens: 1, outputTokens: 2 });
    await jobs.update("j1", { error: "boom" });
    expect(await jobs.get("j1")).toMatchObject({
      error: "boom",
      usage: { inputTokens: 11, outputTokens: 7 },
    });
    expect(await jobs.listByBook("b1")).toHaveLength(1);
  });
});

describe("SqliteTranslationRepository", () => {
  it("upserts and deletes segment translations", async () => {
    await new SqliteBookRepository(db).insert(book, parsed);
    await new SqliteJobRepository(db).insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    const repo = new SqliteTranslationRepository(db);
    await repo.put("j1", "s1", { text: "a", status: "flagged" });
    await repo.put("j1", "s1", { text: "b", status: "done" });
    await repo.put("j1", "s2", { text: "c", status: "done" });
    expect(await repo.get("j1", "s1")).toEqual({ text: "b", status: "done" });
    await repo.deleteMany("j1", ["s1"]);
    expect([...(await repo.forJob("j1")).keys()]).toEqual(["s2"]);
  });

  it("keeps the reason a segment failed", async () => {
    await new SqliteBookRepository(db).insert(book, parsed);
    await new SqliteJobRepository(db).insert({
      id: "j1",
      bookId: "b1",
      targetLang: "en",
      sourceLang: "ja",
      error: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: book.createdAt,
    });
    const repo = new SqliteTranslationRepository(db);
    await repo.put("j1", "s1", { text: "", status: "failed", note: "declined" });
    await repo.put("j1", "s2", { text: "ok", status: "done" });
    expect(await repo.get("j1", "s1")).toEqual({ text: "", status: "failed", note: "declined" });
    expect((await repo.forJob("j1")).get("s2")).toEqual({ text: "ok", status: "done" });
  });
});
