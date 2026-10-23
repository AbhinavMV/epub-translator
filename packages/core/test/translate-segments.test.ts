import { getTargetLanguage } from "@et/contracts";
import { describe, expect, it } from "vitest";
import type { ParsedSegment } from "../src/domain/book.ts";
import { FatalProviderError } from "../src/domain/errors.ts";
import type {
  SegmentBatchRequest,
  SegmentBatchResult,
  TranslationProvider,
} from "../src/ports/translation-provider.ts";
import { batchSegments } from "../src/translation/batcher.ts";
import { buildPrompt } from "../src/translation/prompt.ts";
import { SegmentTranslator } from "../src/translation/translate-segments.ts";

const usage = { inputTokens: 10, outputTokens: 5 };

type Script = SegmentBatchResult | ((req: SegmentBatchRequest) => SegmentBatchResult);

class ScriptedProvider implements TranslationProvider {
  readonly id = "fake" as const;
  readonly label = "scripted";
  readonly requests: SegmentBatchRequest[] = [];
  constructor(private readonly script: Script[]) {}
  async listModels() {
    return ["m"];
  }
  async translateSegments(req: SegmentBatchRequest): Promise<SegmentBatchResult> {
    this.requests.push(req);
    const next = this.script.shift();
    if (!next) throw new Error("script exhausted");
    return typeof next === "function" ? next(req) : next;
  }
}

function request(segments: { id: string; text: string }[]): SegmentBatchRequest {
  return {
    model: "m",
    sourceLang: "ja",
    target: getTargetLanguage("en"),
    bookTitle: "Book",
    context: [],
    segments,
  };
}

const ok = (segments: { id: string; text: string }[]): SegmentBatchResult => ({
  kind: "ok",
  segments,
  usage,
});

const echo = (req: SegmentBatchRequest) =>
  ok(req.segments.map((s) => ({ ...s, text: `T:${s.text}` })));

function translator(provider: TranslationProvider, sleeps: number[] = [], maxRetries = 5) {
  return new SegmentTranslator(
    provider,
    async (ms) => {
      sleeps.push(ms);
    },
    maxRetries,
  );
}

const signal = new AbortController().signal;

function seg(ordinal: number, sourceText: string): ParsedSegment {
  return { id: `d#${ordinal}`, chapterId: "c", ordinal, sourceText };
}

describe("batchSegments", () => {
  it("batches by char and count limits", () => {
    const segs = [seg(1, "aaaa"), seg(2, "bbbb"), seg(3, "cccc"), seg(4, "d")];
    expect(batchSegments(segs, 8, 40).map((b) => b.map((s) => s.ordinal))).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(batchSegments(segs, 4000, 3).map((b) => b.map((s) => s.ordinal))).toEqual([
      [1, 2, 3],
      [4],
    ]);
  });

  it("puts an oversized segment alone in its own batch", () => {
    const segs = [seg(1, "a"), seg(2, "x".repeat(50)), seg(3, "b")];
    expect(batchSegments(segs, 10, 40).map((b) => b.map((s) => s.ordinal))).toEqual([
      [1],
      [2],
      [3],
    ]);
  });

  it("returns no batches for no segments", () => {
    expect(batchSegments([])).toEqual([]);
  });
});

describe("buildPrompt", () => {
  it("includes target name and token rules", () => {
    const { system } = buildPrompt(request([{ id: "a", text: "x" }]));
    expect(system).toContain("English");
    expect(system).toContain("Japanese");
    expect(system).toContain("<x2/>");
    expect(system).toContain('{"segments":[{"id","text"}]}');
  });

  it("leaves style choices like honorifics to the reader's instructions", () => {
    expect(buildPrompt(request([{ id: "a", text: "x" }])).system).not.toMatch(/honorific/i);
  });

  it("keeps the system prompt identical for different segments", () => {
    const a = buildPrompt(request([{ id: "a", text: "x" }])).system;
    const b = buildPrompt(request([{ id: "b", text: "y" }])).system;
    expect(a).toBe(b);
  });

  it("appends reader instructions and glossary only when present", () => {
    const plain = buildPrompt(request([])).system;
    expect(plain).not.toContain("Additional instructions from the reader");
    expect(plain).not.toContain("GLOSSARY");
    const rich = buildPrompt({
      ...request([]),
      instructions: "Be formal",
      glossary: [{ source: "魔王", target: "Demon King", note: "title" }],
    }).system;
    expect(rich).toContain("Additional instructions from the reader: Be formal");
    expect(rich).toContain("魔王 → Demon King (title)");
  });

  it("puts book, context, segments and feedback in the user message", () => {
    const { user } = buildPrompt({
      ...request([{ id: "a", text: "x" }]),
      context: [{ source: "s", target: "t" }],
      feedback: "fix it",
    });
    expect(JSON.parse(user)).toMatchObject({
      bookTitle: "Book",
      sourceLang: "ja",
      context: [{ source: "s", target: "t" }],
      segments: [{ id: "a", text: "x" }],
      feedback: "fix it",
    });
  });
});

describe("SegmentTranslator", () => {
  it("translates a batch and sums usage", async () => {
    const provider = new ScriptedProvider([echo]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "x" }]),
      signal,
    );
    expect(out.results.get("a")).toEqual({ text: "T:x", status: "done" });
    expect(out.usage).toEqual(usage);
  });

  it("retries retryable results then succeeds", async () => {
    const provider = new ScriptedProvider([
      { kind: "retryable", cause: "429" },
      { kind: "retryable", cause: "429", retryAfterMs: 7000 },
      echo,
    ]);
    const sleeps: number[] = [];
    const out = await translator(provider, sleeps).translateBatch(
      request([{ id: "a", text: "x" }]),
      signal,
    );
    expect(sleeps).toEqual([1000, 7000]);
    expect(out.results.get("a")?.status).toBe("done");
  });

  it("caps backoff at 30 seconds", async () => {
    const provider = new ScriptedProvider([
      ...Array.from({ length: 7 }, () => ({ kind: "retryable", cause: "x" }) as const),
      echo,
    ]);
    const sleeps: number[] = [];
    await translator(provider, sleeps, 10).translateBatch(
      request([{ id: "a", text: "x" }]),
      signal,
    );
    expect(sleeps).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("throws FatalProviderError when retries are exhausted", async () => {
    const provider = new ScriptedProvider([
      { kind: "retryable", cause: "down" },
      { kind: "retryable", cause: "down" },
    ]);
    await expect(
      translator(provider, [], 1).translateBatch(request([{ id: "a", text: "x" }]), signal),
    ).rejects.toThrow(FatalProviderError);
  });

  it("splits truncated batches", async () => {
    const provider = new ScriptedProvider([{ kind: "truncated", usage }, echo, echo]);
    const out = await translator(provider).translateBatch(
      request([
        { id: "a", text: "1" },
        { id: "b", text: "2" },
      ]),
      signal,
    );
    expect(provider.requests.map((r) => r.segments.map((s) => s.id))).toEqual([
      ["a", "b"],
      ["a"],
      ["b"],
    ]);
    expect(out.results.get("b")).toEqual({ text: "T:2", status: "done" });
    expect(out.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });

  it("marks a single segment that still truncates as failed", async () => {
    const provider = new ScriptedProvider([{ kind: "truncated", usage }]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "x" }]),
      signal,
    );
    expect(out.results.get("a")?.status).toBe("failed");
    expect(out.results.get("a")?.note).toMatch(/too long/i);
  });

  it("records the policy category when the model declines a passage", async () => {
    const provider = new ScriptedProvider([{ kind: "refused", usage, category: "general_harms" }]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "x" }]),
      signal,
    );
    expect(out.results.get("a")).toMatchObject({ status: "failed", text: "" });
    expect(out.results.get("a")?.note).toMatch(/declined.*general_harms/i);
  });

  it("isolates a refused segment by splitting and marks it failed", async () => {
    const provider = new ScriptedProvider([
      { kind: "refused", usage },
      echo,
      { kind: "refused", usage },
    ]);
    const out = await translator(provider).translateBatch(
      request([
        { id: "a", text: "1" },
        { id: "b", text: "2" },
      ]),
      signal,
    );
    expect(out.results.get("a")?.status).toBe("done");
    expect(out.results.get("b")?.status).toBe("failed");
  });

  it("retries only mismatched segments once with feedback", async () => {
    const provider = new ScriptedProvider([
      ok([
        { id: "a", text: "fine" },
        { id: "b", text: "lost tokens" },
      ]),
      ok([{ id: "b", text: "<1>fixed</1>" }]),
    ]);
    const out = await translator(provider).translateBatch(
      request([
        { id: "a", text: "1" },
        { id: "b", text: "<1>2</1>" },
      ]),
      signal,
    );
    expect(provider.requests[1]?.segments.map((s) => s.id)).toEqual(["b"]);
    expect(provider.requests[1]?.feedback).toMatch(/b/);
    expect(provider.requests[1]?.feedback).toMatch(/missing/);
    expect(out.results.get("a")).toEqual({ text: "fine", status: "done" });
    expect(out.results.get("b")).toEqual({ text: "<1>fixed</1>", status: "done" });
  });

  it("retries segments missing from the response", async () => {
    const provider = new ScriptedProvider([ok([]), echo]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "x" }]),
      signal,
    );
    expect(provider.requests[1]?.feedback).toMatch(/missing from your response/);
    expect(out.results.get("a")?.status).toBe("done");
  });

  it("falls back to plain text and flags after second mismatch", async () => {
    const provider = new ScriptedProvider([
      ok([{ id: "a", text: "<1>bad" }]),
      ok([{ id: "a", text: "<1>still bad" }]),
    ]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "<1>x</1>" }]),
      signal,
    );
    expect(provider.requests).toHaveLength(2);
    expect(out.results.get("a")).toMatchObject({ text: "still bad", status: "flagged" });
  });

  it("marks a segment failed when it never comes back, so it is retried later", async () => {
    const provider = new ScriptedProvider([ok([]), ok([])]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "<1>x</1>y" }]),
      signal,
    );
    expect(out.results.get("a")).toMatchObject({ text: "", status: "failed" });
    expect(out.results.get("a")?.note).toMatch(/no translation came back/i);
  });

  it("marks a segment failed when the translation is empty twice", async () => {
    const provider = new ScriptedProvider([
      ok([{ id: "a", text: "" }]),
      ok([{ id: "a", text: " " }]),
    ]);
    const out = await translator(provider).translateBatch(
      request([{ id: "a", text: "……" }]),
      signal,
    );
    expect(out.results.get("a")).toMatchObject({ text: "", status: "failed" });
  });

  it("throws FatalProviderError on fatal", async () => {
    const provider = new ScriptedProvider([{ kind: "fatal", cause: "bad key" }]);
    await expect(
      translator(provider).translateBatch(request([{ id: "a", text: "x" }]), signal),
    ).rejects.toThrow(FatalProviderError);
  });

  it("stops without calling the provider when aborted", async () => {
    const provider = new ScriptedProvider([echo]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      translator(provider).translateBatch(request([{ id: "a", text: "x" }]), controller.signal),
    ).rejects.toThrow();
    expect(provider.requests).toHaveLength(0);
  });
});
