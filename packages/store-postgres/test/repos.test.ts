import type { PGlite } from "@electric-sql/pglite";
import type { Repositories } from "@et/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql } from "../src/index.ts";
import { book, job, parsed } from "./fixtures.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;
let factory: PostgresStoreFactory;
let repos: Repositories;

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await resetData(db);
  factory = new PostgresStoreFactory(sql);
  repos = factory.forOwner(ALICE);
});

describe("PostgresBookRepository", () => {
  it("round-trips a book and its parsed structure", async () => {
    await repos.books.insert(book, parsed);
    expect(await repos.books.get("b1")).toEqual(book);
    expect(await repos.books.getParsed("b1")).toEqual(parsed);
    expect((await repos.books.findBySha256("abc"))?.id).toBe("b1");
    expect(await repos.books.list()).toEqual([book]);
  });

  it("caches the parsed structure and forgets it on delete", async () => {
    await repos.books.insert(book, parsed);
    expect(await repos.books.getParsed("b1")).toBe(await repos.books.getParsed("b1"));
    await repos.books.delete("b1");
    expect(await repos.books.getParsed("b1")).toBeNull();
  });

  it("keeps the cache across repositories of the same owner but never across owners", async () => {
    await repos.books.insert(book, parsed);
    const first = await repos.books.getParsed("b1");
    expect(await factory.forOwner(ALICE).books.getParsed("b1")).toBe(first);
    expect(await factory.forOwner(BOB).books.getParsed("b1")).toBeNull();
  });

  it("serves the updated structure after updateParsed", async () => {
    await repos.books.insert(book, parsed);
    await repos.books.getParsed("b1");
    const next = { ...parsed, title: "新" };
    await repos.books.updateParsed("b1", next);
    expect(await repos.books.getParsed("b1")).toEqual(next);
    expect(await factory.forOwner(ALICE).books.getParsed("b1")).toEqual(next);
  });

  it("lists newest first", async () => {
    const newer = { ...book, id: "b2", sha256: "def", createdAt: "2026-10-24T00:00:00.000Z" };
    await repos.books.insert(book, parsed);
    await repos.books.insert(newer, parsed);
    expect((await repos.books.list()).map((b) => b.id)).toEqual(["b2", "b1"]);
  });

  it("dedupes by sha256 per owner, not globally", async () => {
    await repos.books.insert(book, parsed);
    await expect(repos.books.insert({ ...book, id: "b9" }, parsed)).rejects.toThrow();
    await factory.forOwner(BOB).books.insert(book, parsed);
    expect((await factory.forOwner(BOB).books.findBySha256("abc"))?.id).toBe("b1");
  });

  it("stores and reads the storage blob key", async () => {
    await repos.books.insert(book, parsed);
    const books = factory.forOwner(ALICE).books;
    expect(await books.getBlobKey("b1")).toBeNull();
    await books.setBlobKey("b1", `${ALICE}/books/abc.epub`);
    expect(await books.getBlobKey("b1")).toBe(`${ALICE}/books/abc.epub`);
  });

  it("rejects an owner id that is not a uuid", () => {
    expect(() => factory.forOwner("x'; drop table books; --")).toThrow("uuid");
  });

  it("cascades deletes to settings, jobs and translations", async () => {
    await repos.books.insert(book, parsed);
    await repos.settings.put("b1", {
      customPrompt: "x",
      glossary: [],
      provider: null,
      model: null,
    });
    await repos.jobs.insert(job);
    await repos.translations.put("j1", "s1", { text: "a", status: "done" });
    await repos.books.delete("b1");
    expect(await repos.jobs.get("j1")).toBeNull();
    expect((await repos.translations.forJob("j1")).size).toBe(0);
    expect(await repos.settings.get("b1")).toMatchObject({ customPrompt: "" });
  });
});

describe("PostgresBookSettingsRepository", () => {
  it("returns defaults until settings are saved", async () => {
    await repos.books.insert(book, parsed);
    expect(await repos.settings.get("b1")).toEqual({
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
    await repos.settings.put("b1", s);
    await repos.settings.put("b1", s);
    expect(await repos.settings.get("b1")).toEqual(s);
  });
});

describe("PostgresJobRepository", () => {
  it("finds by book and language and accumulates usage", async () => {
    await repos.books.insert(book, parsed);
    await repos.jobs.insert(job);
    expect((await repos.jobs.findByBookAndLang("b1", "en"))?.id).toBe("j1");
    expect(await repos.jobs.findByBookAndLang("b1", "fr")).toBeNull();
    await repos.jobs.addUsage("j1", { inputTokens: 10, outputTokens: 5 });
    await repos.jobs.addUsage("j1", { inputTokens: 1, outputTokens: 2 });
    await repos.jobs.update("j1", { error: "boom" });
    expect(await repos.jobs.get("j1")).toMatchObject({
      error: "boom",
      usage: { inputTokens: 11, outputTokens: 7 },
    });
    await repos.jobs.update("j1", { error: null, usage: { inputTokens: 3, outputTokens: 4 } });
    expect(await repos.jobs.get("j1")).toMatchObject({
      error: null,
      usage: { inputTokens: 3, outputTokens: 4 },
    });
    expect(await repos.jobs.listByBook("b1")).toHaveLength(1);
  });

  it("rejects a second job for the same book and language", async () => {
    await repos.books.insert(book, parsed);
    await repos.jobs.insert(job);
    await expect(repos.jobs.insert({ ...job, id: "j2" })).rejects.toThrow();
  });
});

describe("PostgresTranslationRepository", () => {
  beforeEach(async () => {
    await repos.books.insert(book, parsed);
    await repos.jobs.insert(job);
  });

  it("upserts and deletes segment translations", async () => {
    await repos.translations.put("j1", "s1", { text: "a", status: "flagged" });
    await repos.translations.put("j1", "s1", { text: "b", status: "done" });
    await repos.translations.put("j1", "s2", { text: "c", status: "done" });
    expect(await repos.translations.get("j1", "s1")).toEqual({ text: "b", status: "done" });
    await repos.translations.deleteMany("j1", ["s1"]);
    expect([...(await repos.translations.forJob("j1")).keys()]).toEqual(["s2"]);
    await repos.translations.deleteMany("j1", []);
    expect((await repos.translations.forJob("j1")).size).toBe(1);
  });

  it("keeps the reason a segment failed", async () => {
    await repos.translations.put("j1", "s1", { text: "", status: "failed", note: "declined" });
    await repos.translations.put("j1", "s2", { text: "ok", status: "done" });
    expect(await repos.translations.get("j1", "s1")).toEqual({
      text: "",
      status: "failed",
      note: "declined",
    });
    expect((await repos.translations.forJob("j1")).get("s2")).toEqual({
      text: "ok",
      status: "done",
    });
  });
});
