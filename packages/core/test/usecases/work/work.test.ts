import type { JobEvent } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBatchResult,
  applyWorkResult,
  ConflictError,
  endClientBatch,
  InvalidWorkResultError,
  LeaseError,
  MemoryWorkLeases,
  planBatchUnits,
  planWorkUnit,
  recordClientBatch,
  type SegmentTranslation,
} from "../../../src/index.ts";
import {
  counterIds,
  fixedClock,
  type MemoryRepos,
  MemoryStoreFactory,
  sampleParsed,
} from "../fakes.ts";

const limits = { maxChars: 4000, maxCount: 40, contextSize: 8 };
const usage = { inputTokens: 3, outputTokens: 4 };

let repos: MemoryRepos;
let leases: MemoryWorkLeases;
let events: JobEvent[];
const sink = { publish: (e: JobEvent) => void events.push(e) };

beforeEach(async () => {
  repos = new MemoryStoreFactory().local();
  leases = new MemoryWorkLeases(fixedClock, counterIds("lease"));
  events = [];
  await repos.books.insert(
    {
      id: "b1",
      title: "本",
      author: null,
      sourceLang: "ja",
      sha256: "x",
      coverHref: null,
      createdAt: "t",
    } as never,
    sampleParsed,
  );
  await repos.jobs.insert({
    id: "j1",
    bookId: "b1",
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: "t",
  });
});

const done = (text: string): SegmentTranslation => ({ text, status: "done" });

describe("planWorkUnit", () => {
  it("leases the pending segments with prompt extras and context", async () => {
    await repos.settings.put("b1", {
      customPrompt: "be terse",
      glossary: [{ source: "一", target: "one" }],
      provider: null,
      model: null,
    });
    await repos.translations.put("j1", "a.xhtml#0", done("one"));
    const unit = await planWorkUnit(repos, leases, { jobId: "j1", chapterId: "ch-0", ...limits });
    expect(unit).toMatchObject({
      jobId: "j1",
      chapterId: "ch-0",
      sourceLang: "ja",
      target: { code: "en" },
      bookTitle: "本",
      instructions: "be terse",
      glossary: [{ source: "一", target: "one" }],
      context: [{ source: "一", target: "one" }],
      segments: [{ id: "a.xhtml#1", text: "二<1>!?</1>" }],
    });
    expect(unit?.leaseId).toBeTruthy();
  });

  it("returns null once the chapter is complete", async () => {
    await repos.translations.put("j1", "a.xhtml#0", done("one"));
    await repos.translations.put("j1", "a.xhtml#1", done("two<1>!?</1>"));
    expect(
      await planWorkUnit(repos, leases, { jobId: "j1", chapterId: "ch-0", ...limits }),
    ).toBeNull();
  });

  it("hands a second concurrent caller the next batch and then nothing", async () => {
    const small = { ...limits, maxCount: 1 };
    const a = await planWorkUnit(repos, leases, { jobId: "j1", chapterId: "ch-0", ...small });
    const b = await planWorkUnit(repos, leases, { jobId: "j1", chapterId: "ch-0", ...small });
    const c = await planWorkUnit(repos, leases, { jobId: "j1", chapterId: "ch-0", ...small });
    expect(a?.segments.map((s) => s.id)).toEqual(["a.xhtml#0"]);
    expect(b?.segments.map((s) => s.id)).toEqual(["a.xhtml#1"]);
    expect(c).toBeNull();
  });

  it("rejects an unknown chapter", async () => {
    await expect(
      planWorkUnit(repos, leases, { jobId: "j1", chapterId: "nope", ...limits }),
    ).rejects.toThrow("Chapter not found");
  });
});

describe("applyWorkResult", () => {
  async function lease() {
    const unit = await planWorkUnit(repos, leases, { jobId: "j1", chapterId: "ch-0", ...limits });
    if (!unit) throw new Error("no unit");
    return unit;
  }

  it("stores results, adds usage, releases the lease and publishes", async () => {
    const unit = await lease();
    const progress = await applyWorkResult(repos, leases, {
      jobId: "j1",
      leaseId: unit.leaseId,
      results: new Map([
        ["a.xhtml#0", done("one")],
        ["a.xhtml#1", done("two<1>!?</1>")],
      ]),
      usage,
      events: sink,
    });
    expect(progress).toMatchObject({ chapterId: "ch-0", status: "done", done: 2, total: 2 });
    expect((await repos.jobs.get("j1"))?.usage).toEqual(usage);
    expect(await leases.get(unit.leaseId)).toBeNull();
    expect(events.map((e) => e.type)).toEqual(["segment.done", "segment.done", "chapter.progress"]);
  });

  it("downgrades a done translation whose placeholders do not match the source", async () => {
    const unit = await lease();
    await applyWorkResult(repos, leases, {
      jobId: "j1",
      leaseId: unit.leaseId,
      results: new Map([["a.xhtml#1", done("two with no tags")]]),
      usage,
    });
    expect(await repos.translations.get("j1", "a.xhtml#1")).toMatchObject({
      status: "flagged",
      text: "two with no tags",
    });
  });

  it("strips tokens from flagged text and blanks failed text", async () => {
    const unit = await lease();
    await applyWorkResult(repos, leases, {
      jobId: "j1",
      leaseId: unit.leaseId,
      results: new Map<string, SegmentTranslation>([
        ["a.xhtml#0", { text: "x", status: "failed", note: "boom" }],
        ["a.xhtml#1", { text: "<9>odd</9>", status: "flagged", note: "n" }],
      ]),
      usage,
    });
    expect(await repos.translations.get("j1", "a.xhtml#0")).toEqual({
      text: "",
      status: "failed",
      note: "boom",
    });
    expect(await repos.translations.get("j1", "a.xhtml#1")).toEqual({
      text: "odd",
      status: "flagged",
      note: "n",
    });
  });

  it("rejects segments outside the lease and writes nothing", async () => {
    const unit = await lease();
    await expect(
      applyWorkResult(repos, leases, {
        jobId: "j1",
        leaseId: unit.leaseId,
        results: new Map([["b.xhtml#0", done("three")]]),
        usage,
      }),
    ).rejects.toBeInstanceOf(InvalidWorkResultError);
    expect(await repos.translations.get("j1", "b.xhtml#0")).toBeNull();
  });

  it("rejects an unknown or reused lease", async () => {
    const unit = await lease();
    const input = { jobId: "j1", results: new Map([["a.xhtml#0", done("one")]]), usage };
    await applyWorkResult(repos, leases, { ...input, leaseId: unit.leaseId });
    await expect(
      applyWorkResult(repos, leases, { ...input, leaseId: unit.leaseId }),
    ).rejects.toBeInstanceOf(LeaseError);
  });

  it("rejects a lease that belongs to another job", async () => {
    const unit = await lease();
    await expect(
      applyWorkResult(repos, leases, {
        jobId: "other",
        leaseId: unit.leaseId,
        results: new Map(),
        usage,
      }),
    ).rejects.toBeInstanceOf(LeaseError);
  });
});

describe("client batches", () => {
  const deps = () => ({ ids: counterIds("batch"), clock: fixedClock, events: sink });
  const record = (segmentIds: string[][] = [["a.xhtml#0", "a.xhtml#1"]]) =>
    recordClientBatch(repos, deps(), {
      jobId: "j1",
      chapterId: "ch-0",
      provider: "anthropic",
      model: "m",
      vendorBatchId: "vb1",
      segmentIds,
    });

  it("plans one unit per split and none while a batch is open", async () => {
    const units = await planBatchUnits(repos, {
      jobId: "j1",
      chapterId: "ch-0",
      ...limits,
      maxCount: 1,
    });
    expect(units.map((u) => [u.customId, u.segments.map((s) => s.id)])).toEqual([
      ["0", ["a.xhtml#0"]],
      ["1", ["a.xhtml#1"]],
    ]);
    await record();
    expect(await planBatchUnits(repos, { jobId: "j1", chapterId: "ch-0", ...limits })).toEqual([]);
  });

  it("records a batch once per chapter and rejects foreign segment ids", async () => {
    await record();
    expect((await repos.batches.openForChapter("j1", "ch-0"))?.vendorBatchId).toBe("vb1");
    await expect(record()).rejects.toBeInstanceOf(ConflictError);
    await expect(record([["b.xhtml#0"]])).rejects.toBeInstanceOf(InvalidWorkResultError);
  });

  it("applies results, vets them and closes the batch", async () => {
    const batch = await record();
    const progress = await applyBatchResult(repos, {
      jobId: "j1",
      batchId: batch.id,
      results: new Map([
        ["a.xhtml#0", done("one")],
        ["a.xhtml#1", done("no tags")],
      ]),
      usage,
    });
    expect(progress).toMatchObject({ done: 1, flagged: 1 });
    expect(await repos.batches.openForChapter("j1", "ch-0")).toBeNull();
    await expect(
      applyBatchResult(repos, { jobId: "j1", batchId: batch.id, results: new Map(), usage }),
    ).rejects.toThrow("not found");
  });

  it("marks a batch failed and surfaces the error on the job", async () => {
    const batch = await record();
    await endClientBatch(repos, {
      jobId: "j1",
      batchId: batch.id,
      status: "failed",
      error: "expired",
    });
    expect(repos.batches.rows.get(batch.id)?.status).toBe("failed");
    expect((await repos.jobs.get("j1"))?.error).toBe("expired");
  });
});
