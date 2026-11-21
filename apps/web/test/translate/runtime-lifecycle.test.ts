import type {
  Proofreader,
  ProofreadRequest,
  SegmentBatchRequest,
  SegmentBatchResult,
  TermExtractionRequest,
  TranslationProvider,
} from "@et/core";
import type { BrowserProvider, createBrowserProvider } from "@et/providers/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSuggestions } from "@/api/suggestion-run";
import { MemoryEnvelopeStore } from "@/keys/memory-store";
import { Vault } from "@/keys/vault";
import { ClientRuntime } from "@/translate/runtime";
import { FakeWorkApi } from "./fake-work-api";

const KEY = "sk-ant-fake-lifecycle-0123456789ABCD";
const PASS = "a passphrase for tests";
const usage = { inputTokens: 1, outputTokens: 1 };
const live = { provider: "anthropic", mode: "live" } as const;

class HangingProvider implements TranslationProvider {
  readonly id = "anthropic" as const;
  readonly label = "Hang";
  signals: AbortSignal[] = [];
  async listModels() {
    return [];
  }
  translateSegments(req: SegmentBatchRequest, signal: AbortSignal): Promise<SegmentBatchResult> {
    this.signals.push(signal);
    return new Promise((resolve, reject) => {
      if (this.finish) {
        resolve({
          kind: "ok",
          segments: req.segments.map((s) => ({ id: s.id, text: s.text })),
          usage,
        });
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }
  finish = false;
}

class EditingProofreader implements Proofreader {
  requests: ProofreadRequest[] = [];
  hang = false;
  async proofread(req: ProofreadRequest, signal: AbortSignal) {
    this.requests.push(req);
    if (this.hang) {
      return new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    }
    const first = req.segments[0];
    return {
      kind: "ok" as const,
      edits: first
        ? [{ id: first.id, kind: "fluency" as const, text: "Better.", reason: "r" }]
        : [],
      notes: [{ source: "周", target: "Amane" }],
      usage,
    };
  }
}

const proofreader = new EditingProofreader();
const termRequests: TermExtractionRequest[] = [];
const termSignals: AbortSignal[] = [];

function bundleOf(provider: TranslationProvider): BrowserProvider {
  return {
    proofreader,
    provider,
    batch: {} as BrowserProvider["batch"],
    terms: {
      extractTerms: async (req: TermExtractionRequest, signal: AbortSignal) => {
        termRequests.push(req);
        termSignals.push(signal);
        return { kind: "ok", terms: [], usage };
      },
    } as unknown as BrowserProvider["terms"],
  };
}

let vault: Vault;
let api: FakeWorkApi;
let provider: HangingProvider;
let created: { provider: string; key: string; model: string }[];
let runtime: ClientRuntime;

beforeEach(async () => {
  vault = new Vault({ store: new MemoryEnvelopeStore(), scope: "u1", iterations: 1000 });
  await vault.load();
  await vault.initialize(PASS);
  await vault.setKey("anthropic", KEY);
  api = new FakeWorkApi({
    chapterId: "ch",
    segments: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, text: `t${i}` })),
  });
  provider = new HangingProvider();
  created = [];
  const createBundle = ((id: string, key: string, model: string) => {
    created.push({ provider: id, key, model });
    return bundleOf(provider);
  }) as unknown as typeof createBrowserProvider;
  runtime = new ClientRuntime({
    api,
    base: { getJob: async () => ({}) as never },
    vault,
    requestUnlock: async () => {},
    sleep: async () => {},
    createBundle,
  });
});

afterEach(() => vi.restoreAllMocks());

async function running() {
  await runtime.translateChapter("j1", "ch", { ...live, model: "m" });
  await vi.waitFor(() => expect(provider.signals.length).toBeGreaterThan(0));
}

describe("locking the vault stops running work", () => {
  it("aborts the in-flight requests and releases their leases", async () => {
    await running();
    vault.lock();
    await runtime.whenIdle();
    expect(provider.signals.every((s) => s.aborted)).toBe(true);
    expect(api.releaseCalls.length).toBeGreaterThan(0);
    expect(api.posted).toHaveLength(0);
    const overlaid = runtime.overlay({
      id: "j1",
      bookId: "b",
      targetLang: "en",
      status: "idle",
      error: null,
      progress: [{ ...api.progress(), status: "partial" }],
      titles: { book: null, chapters: {} },
      usage: { inputTokens: 0, outputTokens: 0 },
      createdAt: "t",
    });
    expect(overlaid.progress[0]?.status).toBe("partial");
    expect(overlaid.progress[0]?.error).toBeNull();
  });

  it("does the same when the sign-out event locks the vault", async () => {
    const target = new EventTarget();
    vault.lockOn(target, ["et:sign-out"]);
    await running();
    target.dispatchEvent(new Event("et:sign-out"));
    await runtime.whenIdle();
    expect(provider.signals.every((s) => s.aborted)).toBe(true);
    expect(api.releaseCalls.length).toBeGreaterThan(0);
  });

  it("leaves work alone when the vault merely forgets a different key", async () => {
    await running();
    await vault.setKey("openai", "sk-fake-openai-123456");
    await vault.forget("openai");
    expect(provider.signals.every((s) => !s.aborted)).toBe(true);
    provider.finish = true;
    runtime.abortChapter("j1", "ch");
    await runtime.whenIdle();
  });
});

describe("clear, retry and cancel release leases", () => {
  it("releases the leases of an aborted chapter", async () => {
    await running();
    runtime.abortChapter("j1", "ch");
    await runtime.whenIdle();
    expect(api.releaseCalls.length).toBeGreaterThan(0);
  });

  it("releases the leases of every chapter when the job is cancelled", async () => {
    await running();
    await runtime.cancel("j1");
    await runtime.whenIdle();
    expect(api.releaseCalls.length).toBeGreaterThan(0);
  });
});

describe("provider bundle cache", () => {
  it("builds a new bundle when the model changes and reuses it when it does not", async () => {
    const suggest = (model: string) =>
      runtime.suggestGlossary("b1", { provider: "anthropic", model });
    await suggest("model-a");
    await suggest("model-a");
    await suggest("model-b");
    expect(created.map((c) => c.model)).toEqual(["model-a", "model-b"]);
  });

  it("uses the chosen model for translation too", async () => {
    provider.finish = true;
    await runtime.translateChapter("j1", "ch", { ...live, model: "model-z" });
    await runtime.whenIdle();
    expect(created.map((c) => c.model)).toContain("model-z");
  });

  it("builds a new bundle when the key changes", async () => {
    await runtime.suggestGlossary("b1", { provider: "anthropic", model: "model-a" });
    await vault.setKey("anthropic", `${KEY}-rotated`);
    await runtime.suggestGlossary("b1", { provider: "anthropic", model: "model-a" });
    const named = created.filter((c) => c.model === "model-a");
    expect(named.map((c) => c.key)).toEqual([KEY, `${KEY}-rotated`]);
  });
});

describe("glossary suggestions in the browser", () => {
  it("fetch the chosen chunk of the chosen sample size and send it to the extractor", async () => {
    termRequests.length = 0;
    await runtime.suggestGlossary("b1", {
      provider: "anthropic",
      model: "m",
      sampleSize: "volume",
      chunk: 2,
    });
    expect(api.sampleQueries.at(-1)).toEqual({ bookId: "b1", size: "volume", chunk: 2 });
    expect(termRequests[0]?.sample).toBe("sample text 2");
  });

  it("sample every volume's chunks in the order of an all-volumes run", async () => {
    const steps = [
      { bookId: "b1", chunk: 0 },
      { bookId: "b1", chunk: 1 },
      { bookId: "b2", chunk: 0 },
    ];
    const before = api.sampleQueries.length;
    const result = await runSuggestions(
      steps,
      (step, signal) =>
        runtime.suggestGlossary(
          step.bookId,
          { provider: "anthropic", model: "m", sampleSize: "volume", chunk: step.chunk },
          signal,
        ),
      { signal: new AbortController().signal },
    );
    expect(result.outcome).toBe("done");
    expect(api.sampleQueries.slice(before)).toEqual([
      { bookId: "b1", size: "volume", chunk: 0 },
      { bookId: "b1", size: "volume", chunk: 1 },
      { bookId: "b2", size: "volume", chunk: 0 },
    ]);
  });

  it("pass the run's abort signal to the extractor", async () => {
    const ctrl = new AbortController();
    await runtime.suggestGlossary("b1", { provider: "anthropic", model: "m" }, ctrl.signal);
    expect(termSignals.at(-1)).toBe(ctrl.signal);
  });

  it("default to one large sample", async () => {
    await runtime.suggestGlossary("b1", { provider: "anthropic", model: "m" });
    expect(api.sampleQueries.at(-1)).toEqual({ bookId: "b1", size: "large", chunk: 0 });
  });

  it("send the project's custom prompt and glossary to the extractor", async () => {
    termRequests.length = 0;
    await runtime.suggestGlossary("b1", { provider: "anthropic", model: "m" });
    expect(termRequests).toHaveLength(1);
    expect(termRequests[0]).toMatchObject({
      instructions: "Keep honorifics.",
      existing: [{ source: "魔王", target: "Demon King" }],
    });
  });
});

describe("proofreading in the browser", () => {
  beforeEach(() => {
    proofreader.requests = [];
    proofreader.hang = false;
  });

  it("proofreads with the vault key and saves only the edits and usage", async () => {
    const run = await runtime.proofreadChapter("job", "ch", {
      provider: "anthropic",
      model: "claude-opus-5-5",
      notes: [{ source: "真昼", target: "Mahiru" }],
    });
    expect(created.at(-1)).toEqual({ provider: "anthropic", key: KEY, model: "claude-opus-5-5" });
    expect(proofreader.requests[0]?.notes).toEqual([{ source: "真昼", target: "Mahiru" }]);
    expect(api.proofreadRecords).toEqual([
      {
        chapterId: "ch",
        body: {
          model: "claude-opus-5-5",
          edits: [{ id: "s0", kind: "fluency", text: "Better.", reason: "r" }],
          usage,
        },
      },
    ]);
    expect(JSON.stringify(api.proofreadRecords)).not.toContain(KEY);
    expect(run.notes.map((n) => n.source)).toEqual(["真昼", "周"]);
  });

  it("stops when the vault locks and saves nothing", async () => {
    proofreader.hang = true;
    const pending = runtime.proofreadChapter("job", "ch", {
      provider: "anthropic",
      model: "m",
    });
    await vi.waitFor(() => expect(proofreader.requests).toHaveLength(1));
    vault.lock();
    await expect(pending).rejects.toBeDefined();
    expect(api.proofreadRecords).toEqual([]);
  });
});
