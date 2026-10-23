import type { ParsedBook, ProviderBatch, StoredBook } from "@et/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Database,
  openDatabase,
  SqliteBatchRepository,
  SqliteBookRepository,
  SqliteJobRepository,
} from "../src/index.ts";

const book: StoredBook = {
  id: "b1",
  sha256: "abc",
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  createdAt: "2026-10-23T00:00:00.000Z",
};
const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "x" }],
};

const batch = (over: Partial<ProviderBatch> = {}): ProviderBatch => ({
  id: "pb1",
  jobId: "j1",
  chapterId: "ch-0",
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  vendorBatchId: "msgbatch_1",
  status: "submitted",
  segmentIds: [["a.xhtml#0"], ["a.xhtml#1", "a.xhtml#2"]],
  createdAt: "2026-10-23T00:00:00.000Z",
  ...over,
});

let db: Database;
let repo: SqliteBatchRepository;
beforeEach(() => {
  db = openDatabase(":memory:");
  new SqliteBookRepository(db).insert(book, parsed);
  new SqliteJobRepository(db).insert({
    id: "j1",
    bookId: "b1",
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: "2026-10-23T00:00:00.000Z",
  });
  repo = new SqliteBatchRepository(db);
});

describe("SqliteBatchRepository", () => {
  it("round-trips a batch with its per-request segment ids", () => {
    repo.insert(batch());
    expect(repo.openForChapter("j1", "ch-0")).toEqual(batch());
  });

  it("lists only submitted batches as open", () => {
    repo.insert(batch());
    repo.insert(batch({ id: "pb2", chapterId: "ch-1", vendorBatchId: "v2" }));
    repo.setStatus("pb1", "ended");
    expect(repo.listOpen().map((b) => b.id)).toEqual(["pb2"]);
    expect(repo.openForChapter("j1", "ch-0")).toBeNull();
    expect(repo.openForJob("j1").map((b) => b.id)).toEqual(["pb2"]);
  });

  it("removes a job's batches when the job is deleted", () => {
    repo.insert(batch());
    db.prepare("DELETE FROM jobs WHERE id = ?").run("j1");
    expect(repo.listOpen()).toEqual([]);
  });

  it("appends the provider_batches migration after the first schema", () => {
    const columns = db.prepare("PRAGMA table_info(provider_batches)").all() as { name: string }[];
    expect(columns.map((c) => c.name)).toContain("vendor_batch_id");
    expect(db.pragma("user_version", { simple: true })).toBe(3);
  });
});
