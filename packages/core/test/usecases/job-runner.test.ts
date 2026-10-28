import { type JobEvent, LOCAL_OWNER_ID } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  JobRunner,
  MemoryWorkLeaseFactory,
  NotFoundError,
  ProviderNotConfiguredError,
  planWorkUnit,
  type SegmentBatchRequest,
  type SegmentBatchResult,
  type TranslationProvider,
} from "../../src/index.ts";
import {
  counterIds,
  fixedClock,
  type MemoryBooks,
  type MemoryJobs,
  type MemorySettings,
  MemoryStoreFactory,
  type MemoryTranslations,
  sampleParsed,
} from "./fakes.ts";

class EchoProvider implements TranslationProvider {
  readonly id = "fake" as const;
  readonly label = "Echo";
  requests: SegmentBatchRequest[] = [];
  gate: Promise<void> | null = null;
  failWith: string | null = null;
  async listModels() {
    return ["echo"];
  }
  async translateSegments(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<SegmentBatchResult> {
    this.requests.push(req);
    if (this.gate) await this.gate;
    if (signal.aborted) throw new Error("aborted");
    if (this.failWith) return { kind: "fatal", cause: this.failWith };
    return {
      kind: "ok",
      segments: req.segments.map((s) => ({ id: s.id, text: `EN:${s.text}` })),
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }
}

const OWNER = LOCAL_OWNER_ID;
const body = { provider: "fake" as const, model: "echo" };

let factory: MemoryStoreFactory;
let books: MemoryBooks;
let jobs: MemoryJobs;
let translations: MemoryTranslations;
let settings: MemorySettings;
let provider: EchoProvider;
let events: JobEvent[];
let runner: JobRunner;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(async () => {
  factory = new MemoryStoreFactory();
  ({ books, jobs, translations, settings } = factory.forOwner(OWNER));
  await books.insert(
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
  await jobs.insert({
    id: "j1",
    bookId: "b1",
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: fixedClock.now().toISOString(),
  });
  provider = new EchoProvider();
  events = [];
  runner = new JobRunner(
    {
      factory,
      providers: (id) => (id === "fake" ? provider : null),
      events: { publish: (e) => events.push(e) },
      sleep: async () => {},
    },
    { chapterConcurrency: 2, contextSize: 8, maxChars: 4000, maxCount: 1 },
  );
});

describe("JobRunner work leases", () => {
  const limits = { maxChars: 4000, maxCount: 1, contextSize: 8 };
  let leases: MemoryWorkLeaseFactory;
  let leased: JobRunner;

  const lease = async (chapterId = "ch-0") =>
    (
      await planWorkUnit(factory.forOwner(OWNER), leases.forOwner(OWNER), {
        jobId: "j1",
        chapterId,
        ...limits,
      })
    )?.segments.map((s) => s.id) ?? null;

  beforeEach(() => {
    leases = new MemoryWorkLeaseFactory(fixedClock, counterIds("lease"));
    leased = new JobRunner(
      {
        factory,
        leases,
        providers: () => provider,
        events: { publish: () => {} },
        sleep: async () => {},
      },
      { chapterConcurrency: 2, contextSize: 8, maxChars: 4000, maxCount: 1 },
    );
  });

  it("clearChapter frees the chapter's leases but keeps other chapters'", async () => {
    expect(await lease()).toEqual(["a.xhtml#0"]);
    expect(await lease()).toEqual(["a.xhtml#1"]);
    expect(await lease("ch-1")).toEqual(["b.xhtml#0"]);
    await leased.clearChapter(OWNER, "j1", "ch-0");
    expect(await lease()).toEqual(["a.xhtml#0"]);
    expect(await lease("ch-1")).toBeNull();
  });

  it("retryChapter frees leases so the next lease starts from the first segment", async () => {
    provider.gate = new Promise(() => {});
    expect(await lease()).toEqual(["a.xhtml#0"]);
    expect(await lease()).toEqual(["a.xhtml#1"]);
    await leased.retryChapter(OWNER, "j1", "ch-0", body);
    expect(await lease()).toEqual(["a.xhtml#0"]);
  });

  it("cancel frees every lease of the job", async () => {
    expect(await lease()).toEqual(["a.xhtml#0"]);
    expect(await lease("ch-1")).toEqual(["b.xhtml#0"]);
    await leased.cancel(OWNER, "j1");
    expect(await lease()).toEqual(["a.xhtml#0"]);
    expect(await lease("ch-1")).toEqual(["b.xhtml#0"]);
  });
});

describe("JobRunner reads", () => {
  it("translating one chapter never reads another chapter's translations by id", async () => {
    await translations.put("j1", "b.xhtml#0", { text: "Keep", status: "done" });
    translations.resetCalls();
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    const asked = translations.forSegmentsCalls.flat();
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((id) => id.startsWith("a.xhtml"))).toBe(true);
  });
});

describe("JobRunner", () => {
  it("translates every segment of a chapter and marks it done", async () => {
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    expect(await translations.get("j1", "a.xhtml#1")).toEqual({
      text: "EN:二<1>!?</1>",
      status: "done",
    });
    expect(await translations.get("j1", "b.xhtml#0")).toBeNull();
    const ch0 = (await runner.summary(OWNER, "j1")).progress.find((p) => p.chapterId === "ch-0");
    expect(ch0).toMatchObject({ status: "done", done: 2, total: 2 });
    expect((await jobs.get("j1"))?.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it("resume skips done segments", async () => {
    await translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    expect(provider.requests.flatMap((r) => r.segments.map((s) => s.id))).toEqual(["a.xhtml#1"]);
  });

  it("sends earlier translated segments as context", async () => {
    await translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    expect(provider.requests[0]?.context).toEqual([{ source: "一", target: "One" }]);
  });

  it("passes custom prompt, glossary and book metadata to the provider", async () => {
    await settings.put("b1", {
      customPrompt: "Use British spelling",
      glossary: [{ source: "シャル", target: "Charlotte" }],
      provider: null,
      model: null,
    });
    await runner.translateChapter(OWNER, "j1", "ch-1", body);
    await runner.whenIdle();
    expect(provider.requests[0]).toMatchObject({
      model: "echo",
      sourceLang: "ja",
      bookTitle: "本",
      target: { code: "en" },
      instructions: "Use British spelling",
      glossary: [{ source: "シャル", target: "Charlotte" }],
    });
  });

  it("cancel stops before the next batch", async () => {
    let release = () => {};
    provider.gate = new Promise((r) => {
      release = r;
    });
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await tick();
    await runner.cancel(OWNER, "j1");
    release();
    await runner.whenIdle();
    expect(provider.requests).toHaveLength(1);
    expect((await translations.forJob("j1")).size).toBe(0);
    expect(
      (await runner.summary(OWNER, "j1")).progress.find((p) => p.chapterId === "ch-0")?.status,
    ).toBe("idle");
  });

  it("fatal provider error fails the chapter with the message", async () => {
    provider.failWith = "invalid x-api-key";
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    const summary = await runner.summary(OWNER, "j1");
    expect(summary.progress.find((p) => p.chapterId === "ch-0")).toMatchObject({
      status: "failed",
      error: "invalid x-api-key",
    });
    expect(summary.status).toBe("failed");
  });

  it("stops the queued chapters of the job after a fatal provider error", async () => {
    const single = new JobRunner(
      {
        factory,
        providers: () => provider,
        events: { publish: () => {} },
        sleep: async () => {},
      },
      { chapterConcurrency: 1, contextSize: 8, maxChars: 4000, maxCount: 40 },
    );
    provider.failWith = "HTTP 401: authentication failed";
    await single.translateAll(OWNER, "j1", body);
    await single.whenIdle();
    expect(provider.requests).toHaveLength(1);
    const summary = await single.summary(OWNER, "j1");
    expect(summary.error).toBe("HTTP 401: authentication failed");
    expect(summary.progress.find((p) => p.chapterId === "ch-1")?.status).toBe("idle");
  });

  it("clears the job error when translation starts again", async () => {
    provider.failWith = "HTTP 401: authentication failed";
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    provider.failWith = null;
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    expect((await runner.summary(OWNER, "j1")).error).toBeNull();
  });

  it("retryChapter clears and retranslates only that chapter", async () => {
    await translations.put("j1", "a.xhtml#0", { text: "Old", status: "flagged" });
    await translations.put("j1", "b.xhtml#0", { text: "Keep", status: "done" });
    await runner.retryChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    expect((await translations.get("j1", "a.xhtml#0"))?.text).toBe("EN:一");
    expect((await translations.get("j1", "b.xhtml#0"))?.text).toBe("Keep");
  });

  it("retryChapter while running restarts the chapter", async () => {
    let release = () => {};
    provider.gate = new Promise((r) => {
      release = r;
    });
    await runner.translateChapter(OWNER, "j1", "ch-1", body);
    await tick();
    await runner.retryChapter(OWNER, "j1", "ch-1", body);
    provider.gate = null;
    release();
    await runner.whenIdle();
    expect(provider.requests).toHaveLength(2);
    expect((await translations.get("j1", "b.xhtml#0"))?.text).toBe("EN:三");
    expect(
      (await runner.summary(OWNER, "j1")).progress.find((p) => p.chapterId === "ch-1")?.status,
    ).toBe("done");
  });

  it("starts the next queued chapter as soon as a running one is cleared", async () => {
    const single = new JobRunner(
      {
        factory,
        providers: () => provider,
        events: { publish: () => {} },
        sleep: async () => {},
      },
      { chapterConcurrency: 1, contextSize: 8, maxChars: 4000, maxCount: 40 },
    );
    let release = () => {};
    provider.gate = new Promise((r) => {
      release = r;
    });
    await single.translateChapter(OWNER, "j1", "ch-0", body);
    await single.translateChapter(OWNER, "j1", "ch-1", body);
    await single.clearChapter(OWNER, "j1", "ch-0");
    await new Promise((r) => setTimeout(r, 0));
    expect(provider.requests.map((r) => r.segments[0]?.id)).toEqual(["a.xhtml#0", "b.xhtml#0"]);
    release();
    await single.whenIdle();
  });

  it("clearChapter removes that chapter's translations", async () => {
    await translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    await translations.put("j1", "b.xhtml#0", { text: "Three", status: "done" });
    await runner.clearChapter(OWNER, "j1", "ch-0");
    expect(await translations.get("j1", "a.xhtml#0")).toBeNull();
    expect(await translations.get("j1", "b.xhtml#0")).not.toBeNull();
  });

  it("translateAll translates every incomplete chapter and the job becomes done", async () => {
    await translations.put("j1", "b.xhtml#0", { text: "Three", status: "done" });
    await runner.translateAll(OWNER, "j1", body);
    await runner.whenIdle();
    expect(provider.requests.flatMap((r) => r.segments.map((s) => s.id)).sort()).toEqual([
      "a.xhtml#0",
      "a.xhtml#1",
    ]);
    expect((await runner.summary(OWNER, "j1")).status).toBe("done");
  });

  it("emits segment.done and chapter.progress events", async () => {
    await runner.translateChapter(OWNER, "j1", "ch-1", body);
    await runner.whenIdle();
    expect(events.some((e) => e.type === "segment.done" && e.segmentId === "b.xhtml#0")).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === "chapter.progress" &&
          e.progress.chapterId === "ch-1" &&
          e.progress.status === "done",
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === "job.status")).toBe(true);
  });

  it("fails the chapter instead of crashing when storage throws mid-task", async () => {
    settings.get = async () => {
      throw new Error("disk I/O error");
    };
    await runner.translateChapter(OWNER, "j1", "ch-0", body);
    await runner.whenIdle();
    expect(
      (await runner.summary(OWNER, "j1")).progress.find((p) => p.chapterId === "ch-0"),
    ).toMatchObject({
      status: "failed",
      error: "disk I/O error",
    });
  });

  it("rejects unconfigured providers and unknown chapters", async () => {
    await expect(
      runner.translateChapter(OWNER, "j1", "ch-0", { provider: "anthropic", model: "m" }),
    ).rejects.toThrow(ProviderNotConfiguredError);
    await expect(runner.translateChapter(OWNER, "j1", "ch-9", body)).rejects.toThrow(NotFoundError);
    await expect(runner.translateChapter(OWNER, "nope", "ch-0", body)).rejects.toThrow(
      NotFoundError,
    );
  });

  describe("with a Contents chapter", () => {
    beforeEach(() => {
      const withContents = {
        ...sampleParsed,
        chapters: [
          ...sampleParsed.chapters,
          { id: "ch-contents", index: -1, title: "Contents", docHrefs: ["nav.xhtml"] },
        ],
        segments: [
          ...sampleParsed.segments,
          { id: "opf#title", chapterId: "ch-contents", ordinal: 0, sourceText: "本" },
          { id: "nav.xhtml#0", chapterId: "ch-contents", ordinal: 0, sourceText: "第一章" },
        ],
      };
      books.rows.set("b1", { book: books.rows.get("b1")?.book as never, parsed: withContents });
      runner = new JobRunner(
        {
          factory,
          providers: (id) => (id === "fake" ? provider : null),
          events: { publish: (e) => events.push(e) },
          sleep: async () => {},
        },
        { chapterConcurrency: 1, contextSize: 8, maxChars: 4000, maxCount: 10 },
      );
    });

    it("translateAll starts with the Contents chapter so titles appear first", async () => {
      await runner.translateAll(OWNER, "j1", body);
      await runner.whenIdle();
      expect(provider.requests[0]?.segments.map((s) => s.id)).toEqual(["opf#title", "nav.xhtml#0"]);
    });

    it("summary carries translated book and chapter titles", async () => {
      await runner.translateChapter(OWNER, "j1", "ch-contents", body);
      await runner.whenIdle();
      expect((await runner.summary(OWNER, "j1")).titles).toEqual({
        book: "EN:本",
        chapters: { "ch-0": "EN:第一章" },
      });
    });
  });
});
