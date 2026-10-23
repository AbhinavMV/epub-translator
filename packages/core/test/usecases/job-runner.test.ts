import type { JobEvent } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  JobRunner,
  NotFoundError,
  ProviderNotConfiguredError,
  type SegmentBatchRequest,
  type SegmentBatchResult,
  type TranslationProvider,
} from "../../src/index.ts";
import {
  fixedClock,
  MemoryBooks,
  MemoryJobs,
  MemorySettings,
  MemoryTranslations,
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

const body = { provider: "fake" as const, model: "echo" };

let books: MemoryBooks;
let jobs: MemoryJobs;
let translations: MemoryTranslations;
let settings: MemorySettings;
let provider: EchoProvider;
let events: JobEvent[];
let runner: JobRunner;

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
  settings = new MemorySettings();
  provider = new EchoProvider();
  events = [];
  runner = new JobRunner(
    {
      books,
      jobs,
      translations,
      settings,
      providers: (id) => (id === "fake" ? provider : null),
      events: { publish: (e) => events.push(e) },
      sleep: async () => {},
    },
    { chapterConcurrency: 2, contextSize: 8, maxChars: 4000, maxCount: 1 },
  );
});

describe("JobRunner", () => {
  it("translates every segment of a chapter and marks it done", async () => {
    runner.translateChapter("j1", "ch-0", body);
    await runner.whenIdle();
    expect(translations.get("j1", "a.xhtml#1")).toEqual({ text: "EN:二<1>!?</1>", status: "done" });
    expect(translations.get("j1", "b.xhtml#0")).toBeNull();
    const ch0 = runner.summary("j1").progress.find((p) => p.chapterId === "ch-0");
    expect(ch0).toMatchObject({ status: "done", done: 2, total: 2 });
    expect(jobs.get("j1")?.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it("resume skips done segments", async () => {
    translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    runner.translateChapter("j1", "ch-0", body);
    await runner.whenIdle();
    expect(provider.requests.flatMap((r) => r.segments.map((s) => s.id))).toEqual(["a.xhtml#1"]);
  });

  it("sends earlier translated segments as context", async () => {
    translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    runner.translateChapter("j1", "ch-0", body);
    await runner.whenIdle();
    expect(provider.requests[0]?.context).toEqual([{ source: "一", target: "One" }]);
  });

  it("passes custom prompt, glossary and book metadata to the provider", async () => {
    settings.put("b1", {
      customPrompt: "Use British spelling",
      glossary: [{ source: "シャル", target: "Charlotte" }],
      provider: null,
      model: null,
    });
    runner.translateChapter("j1", "ch-1", body);
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
    runner.translateChapter("j1", "ch-0", body);
    await Promise.resolve();
    runner.cancel("j1");
    release();
    await runner.whenIdle();
    expect(provider.requests).toHaveLength(1);
    expect(translations.forJob("j1").size).toBe(0);
    expect(runner.summary("j1").progress.find((p) => p.chapterId === "ch-0")?.status).toBe("idle");
  });

  it("fatal provider error fails the chapter with the message", async () => {
    provider.failWith = "invalid x-api-key";
    runner.translateChapter("j1", "ch-0", body);
    await runner.whenIdle();
    const summary = runner.summary("j1");
    expect(summary.progress.find((p) => p.chapterId === "ch-0")).toMatchObject({
      status: "failed",
      error: "invalid x-api-key",
    });
    expect(summary.status).toBe("failed");
  });

  it("retryChapter clears and retranslates only that chapter", async () => {
    translations.put("j1", "a.xhtml#0", { text: "Old", status: "flagged" });
    translations.put("j1", "b.xhtml#0", { text: "Keep", status: "done" });
    runner.retryChapter("j1", "ch-0", body);
    await runner.whenIdle();
    expect(translations.get("j1", "a.xhtml#0")?.text).toBe("EN:一");
    expect(translations.get("j1", "b.xhtml#0")?.text).toBe("Keep");
  });

  it("retryChapter while running restarts the chapter", async () => {
    let release = () => {};
    provider.gate = new Promise((r) => {
      release = r;
    });
    runner.translateChapter("j1", "ch-1", body);
    await Promise.resolve();
    runner.retryChapter("j1", "ch-1", body);
    provider.gate = null;
    release();
    await runner.whenIdle();
    expect(provider.requests).toHaveLength(2);
    expect(translations.get("j1", "b.xhtml#0")?.text).toBe("EN:三");
    expect(runner.summary("j1").progress.find((p) => p.chapterId === "ch-1")?.status).toBe("done");
  });

  it("starts the next queued chapter as soon as a running one is cleared", async () => {
    const single = new JobRunner(
      {
        books,
        jobs,
        translations,
        settings,
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
    single.translateChapter("j1", "ch-0", body);
    single.translateChapter("j1", "ch-1", body);
    await Promise.resolve();
    single.clearChapter("j1", "ch-0");
    await new Promise((r) => setTimeout(r, 0));
    expect(provider.requests.map((r) => r.segments[0]?.id)).toEqual(["a.xhtml#0", "b.xhtml#0"]);
    release();
    await single.whenIdle();
  });

  it("clearChapter removes that chapter's translations", () => {
    translations.put("j1", "a.xhtml#0", { text: "One", status: "done" });
    translations.put("j1", "b.xhtml#0", { text: "Three", status: "done" });
    runner.clearChapter("j1", "ch-0");
    expect(translations.get("j1", "a.xhtml#0")).toBeNull();
    expect(translations.get("j1", "b.xhtml#0")).not.toBeNull();
  });

  it("translateAll translates every incomplete chapter and the job becomes done", async () => {
    translations.put("j1", "b.xhtml#0", { text: "Three", status: "done" });
    runner.translateAll("j1", body);
    await runner.whenIdle();
    expect(provider.requests.flatMap((r) => r.segments.map((s) => s.id)).sort()).toEqual([
      "a.xhtml#0",
      "a.xhtml#1",
    ]);
    expect(runner.summary("j1").status).toBe("done");
  });

  it("emits segment.done and chapter.progress events", async () => {
    runner.translateChapter("j1", "ch-1", body);
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
    settings.get = () => {
      throw new Error("disk I/O error");
    };
    runner.translateChapter("j1", "ch-0", body);
    await runner.whenIdle();
    expect(runner.summary("j1").progress.find((p) => p.chapterId === "ch-0")).toMatchObject({
      status: "failed",
      error: "disk I/O error",
    });
  });

  it("rejects unconfigured providers and unknown chapters", () => {
    expect(() =>
      runner.translateChapter("j1", "ch-0", { provider: "anthropic", model: "m" }),
    ).toThrow(ProviderNotConfiguredError);
    expect(() => runner.translateChapter("j1", "ch-9", body)).toThrow(NotFoundError);
    expect(() => runner.translateChapter("nope", "ch-0", body)).toThrow(NotFoundError);
  });
});
