import type { ProofreadEdit } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  decideProofread,
  FatalProviderError,
  type Proofreader,
  type ProofreadRequest,
  type ProofreadResult,
  proofreadInput,
  proofreadSummaries,
  recordProofread,
  runProofread,
  type SegmentTranslation,
  splitProofreadParts,
} from "../../src/index.ts";
import { fixedClock, type MemoryRepos, MemoryStoreFactory } from "./fakes.ts";

const done = (text: string): SegmentTranslation => ({ text, status: "done" });
const noSleep = async () => {};

class ScriptedProofreader implements Proofreader {
  readonly requests: ProofreadRequest[] = [];
  constructor(private readonly results: ProofreadResult[]) {}
  async proofread(req: ProofreadRequest): Promise<ProofreadResult> {
    this.requests.push(req);
    const next = this.results.shift();
    if (!next) throw new Error("no scripted result");
    return next;
  }
}

const ok = (edits: ProofreadEdit[], notes = [] as { source: string; target: string }[]) =>
  ({ kind: "ok", edits, notes, usage: { inputTokens: 10, outputTokens: 2 } }) as const;

let repos: MemoryRepos;

beforeEach(async () => {
  repos = new MemoryStoreFactory().local();
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
    {
      title: "本",
      author: null,
      sourceLang: "ja",
      coverHref: null,
      chapters: [
        { id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml", "b.xhtml"] },
        { id: "ch-1", index: 1, title: "二", docHrefs: ["c.xhtml"] },
      ],
      segments: [
        { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "シャルは笑った。" },
        { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: "<1>彼</1>は拗ねた。" },
        { id: "b.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "未訳" },
        { id: "c.xhtml#0", chapterId: "ch-1", ordinal: 0, sourceText: "別章" },
      ],
    },
  );
  await repos.settings.put("b1", {
    customPrompt: "keep honorifics",
    glossary: [{ source: "シャル", target: "Shal" }],
    provider: null,
    model: null,
  });
  await repos.jobs.insert({
    id: "j1",
    bookId: "b1",
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: "t",
  });
  await repos.translations.put("j1", "a.xhtml#0", done("Shal smiled."));
  await repos.translations.put("j1", "a.xhtml#1", done("<1>He</1> was angry."));
  await repos.translations.put("j1", "c.xhtml#0", done("Another chapter"));
});

describe("proofreadInput", () => {
  it("sends the chapter's translated segments with the book's prompt extras", async () => {
    const input = await proofreadInput(repos, "j1", "ch-0");
    expect(input).toMatchObject({
      sourceLang: "ja",
      target: { code: "en" },
      bookTitle: "本",
      instructions: "keep honorifics",
      glossary: [{ source: "シャル", target: "Shal" }],
    });
    expect(input.parts.flat().map((s) => s.id)).toEqual(["a.xhtml#0", "a.xhtml#1"]);
    expect(input.parts[0]?.[1]).toEqual({
      id: "a.xhtml#1",
      source: "<1>彼</1>は拗ねた。",
      translation: "<1>He</1> was angry.",
    });
  });

  it("splits a long chapter into parts that keep reading order", () => {
    const seg = (i: number) => ({
      id: `s${i}`,
      source: "あ".repeat(40),
      translation: "a".repeat(40),
    });
    const parts = splitProofreadParts([seg(0), seg(1), seg(2)], 170);
    expect(parts.map((p) => p.map((s) => s.id))).toEqual([["s0", "s1"], ["s2"]]);
  });
});

describe("runProofread", () => {
  it("stores vetted suggestions, adds usage and returns the notes", async () => {
    const proofreader = new ScriptedProofreader([
      ok(
        [
          {
            id: "a.xhtml#1",
            kind: "accuracy",
            text: "<1>He</1> was sulking.",
            reason: "拗ねる is sulk",
          },
          { id: "a.xhtml#0", kind: "fluency", text: "Shal smiled.", reason: "unchanged" },
          { id: "c.xhtml#0", kind: "other", text: "x", reason: "other chapter" },
          { id: "nope", kind: "other", text: "x", reason: "unknown" },
        ],
        [{ source: "シャル", target: "Shal" }],
      ),
    ]);
    const run = await runProofread(
      { repos, proofreader, sleep: noSleep, clock: fixedClock },
      { jobId: "j1", chapterId: "ch-0", model: "m", notes: [{ source: "周", target: "Amane" }] },
      new AbortController().signal,
    );
    expect(proofreader.requests[0]?.notes).toEqual([{ source: "周", target: "Amane" }]);
    expect(run.proofread.suggestions).toEqual([
      {
        segmentId: "a.xhtml#1",
        kind: "accuracy",
        before: "<1>He</1> was angry.",
        after: "<1>He</1> was sulking.",
        reason: "拗ねる is sulk",
        state: "pending",
      },
    ]);
    expect(run.notes).toEqual([
      { source: "周", target: "Amane" },
      { source: "シャル", target: "Shal" },
    ]);
    expect((await repos.jobs.get("j1"))?.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
    expect(await repos.proofreads.get("j1", "ch-0")).toEqual(run.proofread);
  });

  it("drops an edit that breaks the formatting tags", async () => {
    const proofreader = new ScriptedProofreader([
      ok([{ id: "a.xhtml#1", kind: "accuracy", text: "He was sulking.", reason: "r" }]),
    ]);
    const run = await runProofread(
      { repos, proofreader, sleep: noSleep, clock: fixedClock },
      { jobId: "j1", chapterId: "ch-0", model: "m", notes: [] },
      new AbortController().signal,
    );
    expect(run.proofread.suggestions).toEqual([]);
  });

  it("retries a retryable failure and gives up with a typed error on a fatal one", async () => {
    const retrying = new ScriptedProofreader([{ kind: "retryable", cause: "busy" }, ok([])]);
    await runProofread(
      { repos, proofreader: retrying, sleep: noSleep, clock: fixedClock },
      { jobId: "j1", chapterId: "ch-0", model: "m", notes: [] },
      new AbortController().signal,
    );
    expect(retrying.requests).toHaveLength(2);

    const fatal = new ScriptedProofreader([{ kind: "fatal", cause: "bad key" }]);
    await expect(
      runProofread(
        { repos, proofreader: fatal, sleep: noSleep, clock: fixedClock },
        { jobId: "j1", chapterId: "ch-0", model: "m", notes: [] },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(FatalProviderError);
    expect(await repos.proofreads.get("j1", "ch-0")).not.toBeNull();
  });
});

describe("decideProofread", () => {
  beforeEach(async () => {
    await recordProofread(repos, fixedClock, {
      jobId: "j1",
      chapterId: "ch-0",
      model: "m",
      usage: { inputTokens: 0, outputTokens: 0 },
      edits: [
        { id: "a.xhtml#0", kind: "consistency", text: "Mahiru smiled.", reason: "name" },
        { id: "a.xhtml#1", kind: "accuracy", text: "<1>He</1> was sulking.", reason: "sulk" },
      ],
    });
  });

  it("applies accepted suggestions and records rejected ones", async () => {
    const result = await decideProofread(repos, "j1", "ch-0", {
      accept: ["a.xhtml#1"],
      reject: ["a.xhtml#0"],
    });
    expect(result.suggestions.map((s) => [s.segmentId, s.state])).toEqual([
      ["a.xhtml#0", "rejected"],
      ["a.xhtml#1", "accepted"],
    ]);
    expect(await repos.translations.get("j1", "a.xhtml#1")).toEqual(done("<1>He</1> was sulking."));
    expect(await repos.translations.get("j1", "a.xhtml#0")).toEqual(done("Shal smiled."));
  });

  it("marks a suggestion outdated instead of overwriting a newer edit", async () => {
    await repos.translations.put("j1", "a.xhtml#0", done("Shal grinned."));
    const result = await decideProofread(repos, "j1", "ch-0", {
      accept: ["a.xhtml#0"],
      reject: [],
    });
    expect(result.suggestions[0]?.state).toBe("outdated");
    expect(await repos.translations.get("j1", "a.xhtml#0")).toEqual(done("Shal grinned."));
  });

  it("summarises pending suggestions per chapter", async () => {
    await decideProofread(repos, "j1", "ch-0", { accept: [], reject: ["a.xhtml#0"] });
    expect(await proofreadSummaries(repos, "j1")).toEqual([
      { chapterId: "ch-0", createdAt: "2026-10-23T00:00:00.000Z", pending: 1, total: 2 },
    ]);
  });
});
