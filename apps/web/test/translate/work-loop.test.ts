import type { SegmentBatchRequest, SegmentBatchResult, TranslationProvider } from "@et/core";
import type { BrowserProvider } from "@et/providers/browser";
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/client";
import { WorkLoop } from "@/translate/work-loop";
import { FakeWorkApi } from "./fake-work-api";

const SEGMENTS = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, text: `src${i}` }));
const run = { provider: "anthropic" as const, model: "m" };
const usage = { inputTokens: 3, outputTokens: 2 };

class EchoProvider implements TranslationProvider {
  readonly id = "anthropic" as const;
  readonly label = "Echo";
  requests: SegmentBatchRequest[] = [];
  inFlight = 0;
  maxInFlight = 0;
  behaviour: (req: SegmentBatchRequest) => SegmentBatchResult | Promise<SegmentBatchResult> = (
    req,
  ) => ({
    kind: "ok",
    segments: req.segments.map((s) => ({ id: s.id, text: `EN:${s.text}` })),
    usage,
  });
  async listModels() {
    return [];
  }
  async translateSegments(req: SegmentBatchRequest, signal: AbortSignal) {
    this.requests.push(req);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await new Promise((r) => setTimeout(r, 1));
      signal.throwIfAborted();
      return await this.behaviour(req);
    } finally {
      this.inFlight--;
    }
  }
}

const instant = async () => {};

function loopFor(api: FakeWorkApi, provider: EchoProvider, concurrency?: number) {
  const bundle = { provider } as unknown as BrowserProvider;
  return new WorkLoop({
    api,
    bundleFor: () => bundle,
    redact: (_p, text) => text.replaceAll("sk-fake-secret", "[redacted]"),
    sleep: instant,
    ...(concurrency === undefined ? {} : { concurrency: () => concurrency }),
  });
}

const newApi = () => new FakeWorkApi({ chapterId: "ch", segments: SEGMENTS });

describe("WorkLoop.runChapter", () => {
  it("leases and posts until the server answers 204", async () => {
    const api = newApi();
    const progress: number[] = [];
    const result = await loopFor(api, new EchoProvider()).runChapter("j1", "ch", run, {
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p.done),
    });
    expect(result).toMatchObject({ done: 7, total: 7, status: "done" });
    expect(api.results.get("s3")).toMatchObject({ text: "EN:src3", status: "done" });
    expect(api.usage.inputTokens).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(7);
  });

  it("keeps two leases in flight by default and honours a setting", async () => {
    const two = new EchoProvider();
    await loopFor(newApi(), two).runChapter("j1", "ch", run, {
      signal: new AbortController().signal,
    });
    expect(two.maxInFlight).toBe(2);
    const one = new EchoProvider();
    await loopFor(newApi(), one, 1).runChapter("j1", "ch", run, {
      signal: new AbortController().signal,
    });
    expect(one.maxInFlight).toBe(1);
  });

  it("advances the cursor so persistent failures are not leased again", async () => {
    const api = newApi();
    const provider = new EchoProvider();
    provider.behaviour = () => ({ kind: "refused", usage });
    const result = await loopFor(api, provider).runChapter("j1", "ch", run, {
      signal: new AbortController().signal,
    });
    expect(result?.failed).toBe(7);
    expect(api.leaseCalls.at(0)).toBeUndefined();
    expect(api.leaseCalls.filter((c) => c !== undefined).length).toBeGreaterThan(0);
  });

  it("stops on a fatal provider error and reports it redacted", async () => {
    const api = newApi();
    const provider = new EchoProvider();
    provider.behaviour = () => ({ kind: "fatal", cause: "HTTP 401: bad key sk-fake-secret" });
    const failure = await loopFor(api, provider)
      .runChapter("j1", "ch", run, { signal: new AbortController().signal })
      .catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("HTTP 401");
    expect((failure as Error).message).not.toContain("sk-fake-secret");
    expect(api.posted).toHaveLength(0);
  });

  it("returns quietly when cancelled mid-flight", async () => {
    const api = newApi();
    const provider = new EchoProvider();
    const controller = new AbortController();
    provider.behaviour = (req) => {
      controller.abort();
      return {
        kind: "ok",
        segments: req.segments.map((s) => ({ id: s.id, text: s.text })),
        usage,
      };
    };
    await expect(
      loopFor(api, provider).runChapter("j1", "ch", run, { signal: controller.signal }),
    ).resolves.not.toThrow();
    expect(api.posted).toHaveLength(0);
  });

  it("does not start when already cancelled", async () => {
    const api = newApi();
    const controller = new AbortController();
    controller.abort();
    expect(
      await loopFor(api, new EchoProvider()).runChapter("j1", "ch", run, {
        signal: controller.signal,
      }),
    ).toBeNull();
    expect(api.leaseCalls).toHaveLength(0);
  });

  it("retries a transient post failure and drops a lost lease", async () => {
    const api = newApi();
    api.failPostsWith = [new ApiRequestError("Cannot reach the API server", 0)];
    const result = await loopFor(api, new EchoProvider()).runChapter("j1", "ch", run, {
      signal: new AbortController().signal,
    });
    expect(result?.done).toBe(7);

    const lost = newApi();
    lost.failPostsWith = [new ApiRequestError("Lease expired or unknown", 409)];
    const after = await loopFor(lost, new EchoProvider()).runChapter("j1", "ch", run, {
      signal: new AbortController().signal,
    });
    expect(after?.done).toBeLessThan(7);
  });

  it("surfaces a non-transient API failure", async () => {
    const api = newApi();
    api.failPostsWith = [new ApiRequestError("Forbidden", 403)];
    await expect(
      loopFor(api, new EchoProvider()).runChapter("j1", "ch", run, {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Forbidden");
  });
});
