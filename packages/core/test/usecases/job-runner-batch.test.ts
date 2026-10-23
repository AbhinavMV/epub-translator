import type { JobEvent } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type BatchFetch,
  BatchNotSupportedError,
  type BatchRequest,
  type BatchTranslationProvider,
  JobRunner,
  type SegmentBatchResult,
  type TranslationProvider,
} from "../../src/index.ts";
import {
  counterIds,
  fixedClock,
  MemoryBatches,
  MemoryBooks,
  MemoryJobs,
  MemorySettings,
  MemoryTranslations,
  sampleParsed,
} from "./fakes.ts";

class ScriptedBatchProvider implements BatchTranslationProvider {
  readonly id = "fake" as const;
  submitted: BatchRequest[][] = [];
  cancelled: string[] = [];
  next: BatchFetch = { status: "in_progress" };
  fetchError: Error | null = null;
  async submit(requests: BatchRequest[]) {
    this.submitted.push(requests);
    return `vendor-${this.submitted.length}`;
  }
  async fetch(): Promise<BatchFetch> {
    if (this.fetchError) throw this.fetchError;
    return this.next;
  }
  async cancel(batchId: string) {
    this.cancelled.push(batchId);
  }
}

const liveNeverCalled: TranslationProvider = {
  id: "fake",
  label: "live",
  listModels: async () => [],
  translateSegments: async () => {
    throw new Error("live provider must not be used in batch mode");
  },
};

function okFor(pairs: [string, string][]): SegmentBatchResult {
  return {
    kind: "ok",
    segments: pairs.map(([id, text]) => ({ id, text })),
    usage: { inputTokens: 7, outputTokens: 3 },
  };
}

const batchBody = { provider: "fake" as const, model: "echo", mode: "batch" as const };

let books: MemoryBooks;
let jobs: MemoryJobs;
let translations: MemoryTranslations;
let batches: MemoryBatches;
let vendor: ScriptedBatchProvider;
let events: JobEvent[];
let runner: JobRunner;

function makeRunner(): JobRunner {
  return new JobRunner(
    {
      books,
      jobs,
      translations,
      settings: new MemorySettings(),
      providers: () => liveNeverCalled,
      events: { publish: (e) => events.push(e) },
      sleep: async () => {},
      batch: {
        repo: batches,
        provider: (id) => (id === "fake" ? vendor : null),
        ids: counterIds("batch"),
        clock: fixedClock,
      },
    },
    { chapterConcurrency: 2, contextSize: 8, maxChars: 4000, maxCount: 1 },
  );
}

const chapter = (id: string) => runner.summary("j1").progress.find((p) => p.chapterId === id);

beforeEach(() => {
  books = new MemoryBooks();
  books.insert(
    {
      id: "b1",
      sha256: "s",
      title: "本",
      author: null,
      sourceLang: "ja",
      coverHref: null,
      createdAt: "",
    },
    sampleParsed,
  );
  jobs = new MemoryJobs();
  jobs.insert({
    id: "j1",
    bookId: "b1",
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: fixedClock.now().toISOString(),
  });
  translations = new MemoryTranslations();
  batches = new MemoryBatches();
  vendor = new ScriptedBatchProvider();
  events = [];
  runner = makeRunner();
});

describe("JobRunner batch mode", () => {
  it("submits one vendor batch per chapter with one request per split", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    expect(vendor.submitted).toHaveLength(1);
    expect(vendor.submitted[0]?.map((r) => r.customId)).toEqual(["0", "1"]);
    expect(vendor.submitted[0]?.map((r) => r.request.segments.map((s) => s.id))).toEqual([
      ["a.xhtml#0"],
      ["a.xhtml#1"],
    ]);
    expect(batches.listOpen()[0]).toMatchObject({
      jobId: "j1",
      chapterId: "ch-0",
      vendorBatchId: "vendor-1",
      segmentIds: [["a.xhtml#0"], ["a.xhtml#1"]],
    });
    expect(chapter("ch-0")?.status).toBe("submitted");
    expect(runner.summary("j1").status).toBe("running");
  });

  it("translate-all submits every unfinished chapter as its own batch", async () => {
    translations.put("j1", "b.xhtml#0", { text: "Done", status: "done" });
    runner.translateAll("j1", batchBody);
    await runner.whenIdle();
    expect(vendor.submitted).toHaveLength(1);
    expect(chapter("ch-1")?.status).toBe("done");
  });

  it("does not submit a chapter that already has an open batch", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    expect(vendor.submitted).toHaveLength(1);
  });

  it("only previously done segments are sent as context", async () => {
    translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    const requests = vendor.submitted[0] ?? [];
    expect(requests).toHaveLength(1);
    expect(requests[0]?.request.context).toEqual([{ source: "一", target: "One" }]);
  });

  it("keeps the chapter submitted while the vendor is still working", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    await runner.pollBatches();
    expect(chapter("ch-0")?.status).toBe("submitted");
    expect(translations.forJob("j1").size).toBe(0);
  });

  it("applies ended results keyed by custom id, validating placeholder tokens", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    vendor.next = {
      status: "ended",
      results: new Map([
        ["1", okFor([["a.xhtml#1", "Two<1>!?</1>"]])],
        ["0", okFor([["a.xhtml#0", "One"]])],
      ]),
    };
    await runner.pollBatches();
    expect(translations.get("j1", "a.xhtml#0")).toEqual({ text: "One", status: "done" });
    expect(translations.get("j1", "a.xhtml#1")).toEqual({
      text: "Two<1>!?</1>",
      status: "done",
    });
    expect(chapter("ch-0")).toMatchObject({ status: "done", done: 2 });
    expect(jobs.get("j1")?.usage).toEqual({ inputTokens: 14, outputTokens: 6 });
    expect(batches.listOpen()).toHaveLength(0);
    expect(events.filter((e) => e.type === "segment.done")).toHaveLength(2);
  });

  it("flags a result whose tokens do not match and fails missing or non-ok results without retrying", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    vendor.next = {
      status: "ended",
      results: new Map([["0", okFor([["a.xhtml#0", "One<1>"]])]]),
    };
    await runner.pollBatches();
    expect(translations.get("j1", "a.xhtml#0")).toMatchObject({ text: "One", status: "flagged" });
    expect(translations.get("j1", "a.xhtml#1")).toMatchObject({ text: "", status: "failed" });
    expect(chapter("ch-0")).toMatchObject({ status: "partial", flagged: 1, failed: 1 });
    expect(vendor.submitted).toHaveLength(1);
  });

  it("fails segments of a request the vendor reported as errored", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    vendor.next = {
      status: "ended",
      results: new Map<string, SegmentBatchResult>([
        ["0", { kind: "fatal", cause: "invalid_request" }],
        ["1", okFor([["a.xhtml#1", "Two<1>!?</1>"]])],
      ]),
    };
    await runner.pollBatches();
    expect(translations.get("j1", "a.xhtml#0")?.status).toBe("failed");
    expect(translations.get("j1", "a.xhtml#1")?.status).toBe("done");
  });

  it("fails the chapter with the vendor cause when the whole batch fails", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    vendor.next = { status: "failed", cause: "batch expired" };
    await runner.pollBatches();
    expect(chapter("ch-0")).toMatchObject({ status: "failed", error: "batch expired" });
    expect(batches.listOpen()).toHaveLength(0);
  });

  it("keeps a batch open when the poll itself errors", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    vendor.fetchError = new Error("network down");
    await runner.pollBatches();
    expect(batches.listOpen()).toHaveLength(1);
    expect(chapter("ch-0")?.status).toBe("submitted");
  });

  it("a fresh runner resumes open batches from the repository", async () => {
    runner.translateChapter("j1", "ch-1", batchBody);
    await runner.whenIdle();
    const rebooted = makeRunner();
    vendor.next = {
      status: "ended",
      results: new Map([["0", okFor([["b.xhtml#0", "Three"]])]]),
    };
    expect(rebooted.summary("j1").progress.find((p) => p.chapterId === "ch-1")?.status).toBe(
      "submitted",
    );
    await rebooted.pollBatches();
    expect(translations.get("j1", "b.xhtml#0")?.text).toBe("Three");
  });

  it("clearing a submitted chapter cancels the vendor batch and drops its results", async () => {
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    runner.clearChapter("j1", "ch-0");
    await runner.whenIdle();
    expect(vendor.cancelled).toEqual(["vendor-1"]);
    expect(chapter("ch-0")?.status).toBe("idle");
    vendor.next = {
      status: "ended",
      results: new Map([["0", okFor([["a.xhtml#0", "One"]])]]),
    };
    await runner.pollBatches();
    expect(translations.forJob("j1").size).toBe(0);
  });

  it("cancel stops every submitted chapter of the job", async () => {
    runner.translateAll("j1", batchBody);
    await runner.whenIdle();
    runner.cancel("j1");
    await runner.whenIdle();
    expect(vendor.cancelled).toHaveLength(2);
    expect(runner.summary("j1").status).toBe("idle");
  });

  it("retrying a submitted chapter resubmits it", async () => {
    runner.translateChapter("j1", "ch-1", batchBody);
    await runner.whenIdle();
    runner.retryChapter("j1", "ch-1", batchBody);
    await runner.whenIdle();
    expect(vendor.submitted).toHaveLength(2);
    expect(chapter("ch-1")?.status).toBe("submitted");
  });

  it("records a submission failure as a chapter error", async () => {
    vendor.submit = async () => {
      throw new Error("quota exceeded");
    };
    runner.translateChapter("j1", "ch-0", batchBody);
    await runner.whenIdle();
    expect(chapter("ch-0")).toMatchObject({ status: "failed", error: "quota exceeded" });
  });

  it("rejects batch mode for a provider without batch support", () => {
    const noBatch = new JobRunner({
      books,
      jobs,
      translations,
      settings: new MemorySettings(),
      providers: () => liveNeverCalled,
      events: { publish: () => {} },
      sleep: async () => {},
      batch: { repo: batches, provider: () => null, ids: counterIds(), clock: fixedClock },
    });
    expect(() => noBatch.translateChapter("j1", "ch-0", batchBody)).toThrow(BatchNotSupportedError);
  });

  it("skips the vendor call when nothing is pending", async () => {
    translations.put("j1", "b.xhtml#0", { text: "x", status: "done" });
    runner.translateChapter("j1", "ch-1", batchBody);
    await runner.whenIdle();
    expect(vendor.submitted).toHaveLength(0);
    expect(chapter("ch-1")?.status).toBe("done");
  });
});
