import type { PGlite } from "@electric-sql/pglite";
import type { ChapterProofread } from "@et/contracts";
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

  it("reads only the requested segments, scoped to the job and owner", async () => {
    await repos.translations.put("j1", "s1", { text: "a", status: "done" });
    await repos.translations.put("j1", "s2", { text: "b", status: "done" });
    await repos.translations.put("j1", "s3", { text: "c", status: "failed", note: "x" });
    const got = await repos.translations.forSegments("j1", ["s1", "s3", "missing"]);
    expect([...got.keys()].sort()).toEqual(["s1", "s3"]);
    expect(got.get("s3")).toEqual({ text: "c", status: "failed", note: "x" });
    expect((await repos.translations.forSegments("j1", [])).size).toBe(0);
    expect((await repos.translations.forSegments("other", ["s1"])).size).toBe(0);
    expect(await repos.translations.statusesForJob("j1")).toEqual(
      new Map([
        ["s1", "done"],
        ["s2", "done"],
        ["s3", "failed"],
      ]),
    );
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

describe("PostgresProofreadRepository", () => {
  const proofread: ChapterProofread = {
    jobId: "j1",
    chapterId: "ch-0",
    model: "m",
    createdAt: "2026-10-28T00:00:00.000Z",
    usage: { inputTokens: 5, outputTokens: 1 },
    suggestions: [
      {
        segmentId: "a.xhtml#0",
        kind: "accuracy",
        before: "Hi",
        after: "Hello",
        reason: "r",
        state: "pending",
      },
    ],
  };

  beforeEach(async () => {
    await repos.books.insert(book, parsed);
    await repos.jobs.insert(job);
  });

  it("round-trips, replaces and deletes a chapter's proofread", async () => {
    expect(await repos.proofreads.get("j1", "ch-0")).toBeNull();
    await repos.proofreads.put(proofread);
    expect(await repos.proofreads.get("j1", "ch-0")).toEqual(proofread);
    const decided: ChapterProofread = {
      ...proofread,
      suggestions: proofread.suggestions.map((s) => ({ ...s, state: "accepted" })),
    };
    await repos.proofreads.put(decided);
    expect(await repos.proofreads.listForJob("j1")).toEqual([decided]);
    expect(await factory.forOwner(BOB).proofreads.listForJob("j1")).toEqual([]);
    await repos.proofreads.delete("j1", "ch-0");
    expect(await repos.proofreads.get("j1", "ch-0")).toBeNull();
  });

  it("goes away with its job's book", async () => {
    await repos.proofreads.put(proofread);
    await repos.books.delete("b1");
    expect(await repos.proofreads.listForJob("j1")).toEqual([]);
  });
});
