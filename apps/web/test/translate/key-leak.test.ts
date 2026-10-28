import { getTargetLanguage } from "@et/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEnvelopeStore } from "@/keys/memory-store";
import { Vault } from "@/keys/vault";
import { ClientRuntime } from "@/translate/runtime";
import { createWorkApi } from "@/translate/work-api";

const KEY = "sk-ant-fake-leakcheck-0123456789ABCDwxyz";
const PASS = "passphrase-for-tests";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

let calls: Call[];
let leased: boolean;
let providerStatus: number;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const progress = {
  chapterId: "ch",
  status: "done",
  done: 2,
  flagged: 0,
  failed: 0,
  total: 2,
  error: null,
};

async function fakeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = String(input instanceof Request ? input.url : input);
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, name) => {
    headers[name] = v;
  });
  const body = typeof init?.body === "string" ? init.body : "";
  calls.push({ url, method: init?.method ?? "GET", headers, body });

  if (url.startsWith("https://api.anthropic.com")) {
    if (providerStatus !== 200) {
      return jsonResponse(providerStatus, {
        type: "error",
        error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` },
      });
    }
    return jsonResponse(200, {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "m",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            segments: [
              { id: "s0", text: "zero" },
              { id: "s1", text: "one" },
            ],
          }),
        },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 7, output_tokens: 3 },
    });
  }
  if (url.endsWith("/lease")) {
    if (leased) return new Response(null, { status: 204 });
    leased = true;
    return jsonResponse(200, {
      leaseId: "L1",
      jobId: "j1",
      chapterId: "ch",
      sourceLang: "ja",
      target: getTargetLanguage("en"),
      bookTitle: "B",
      context: [],
      segments: [
        { id: "s0", text: "零" },
        { id: "s1", text: "一" },
      ],
    });
  }
  if (url.endsWith("/results")) return jsonResponse(200, progress);
  return jsonResponse(404, { error: "not found" });
}

let vault: Vault;
let store: MemoryEnvelopeStore;
let runtime: ClientRuntime;

beforeEach(async () => {
  calls = [];
  leased = false;
  providerStatus = 200;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  store = new MemoryEnvelopeStore();
  vault = new Vault({ store, scope: "u1", iterations: 1000 });
  await vault.load();
  await vault.initialize(PASS);
  await vault.setKey("anthropic", KEY);
  runtime = new ClientRuntime({
    api: createWorkApi(),
    base: { getJob: async () => ({}) as never },
    vault,
    requestUnlock: async () => {},
    sleep: async () => {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const ours = () => calls.filter((c) => c.url.startsWith("/api"));
const theirs = () => calls.filter((c) => c.url.startsWith("https://"));
const leaks = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.includes(KEY) || text.includes(KEY.slice(-12)) || text.includes(KEY.slice(0, 16));
};

describe("provider key containment", () => {
  it("sends the key to the provider only, never to /api", async () => {
    await runtime.translateChapter("j1", "ch", {
      provider: "anthropic",
      model: "m",
      mode: "live",
    });
    await runtime.whenIdle();

    expect(ours().length).toBeGreaterThanOrEqual(3);
    expect(ours().some((c) => c.url.endsWith("/results"))).toBe(true);
    expect(leaks(ours())).toBe(false);
    expect(theirs()).not.toHaveLength(0);
    expect(theirs().every((c) => c.url.startsWith("https://api.anthropic.com"))).toBe(true);
    expect(theirs().some((c) => Object.values(c.headers).some((v) => v.includes(KEY)))).toBe(true);
    expect(calls.some((c) => c.url.includes(KEY))).toBe(false);
  });

  it("never persists the key in web storage or the envelope store", async () => {
    await runtime.translateChapter("j1", "ch", { provider: "anthropic", model: "m", mode: "live" });
    await runtime.whenIdle();
    const dump = JSON.stringify([
      { ...window.localStorage },
      { ...window.sessionStorage },
      store.all(),
    ]);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(PASS);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it("redacts a provider error that echoes the key before it reaches the banner", async () => {
    providerStatus = 401;
    const updates: string[] = [];
    runtime.subscribe(() => {
      updates.push(
        JSON.stringify(
          runtime.overlay({
            id: "j1",
            bookId: "b",
            targetLang: "en",
            status: "idle",
            error: null,
            progress: [{ ...progress, status: "partial", done: 0 }],
            titles: { book: null, chapters: {} },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: "t",
          }),
        ),
      );
    });
    await runtime.translateChapter("j1", "ch", { provider: "anthropic", model: "m", mode: "live" });
    await runtime.whenIdle();
    const last = JSON.parse(updates.at(-1) ?? "{}");
    expect(last.progress[0].status).toBe("failed");
    expect(last.progress[0].error).toContain("HTTP 401");
    expect(leaks(updates)).toBe(false);
    expect(leaks(ours())).toBe(false);
    expect(ours().some((c) => c.url.endsWith("/results"))).toBe(false);
  });

  it("refuses to run once the vault is locked", async () => {
    vault.lock();
    await expect(
      runtime.translateChapter("j1", "ch", { provider: "anthropic", model: "m", mode: "live" }),
    ).rejects.toThrow("unlock your anthropic key");
    expect(calls).toHaveLength(0);
  });
});
