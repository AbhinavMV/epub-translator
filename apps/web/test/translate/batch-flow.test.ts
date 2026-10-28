import { getTargetLanguage } from "@et/contracts";
import type { BatchFetch, BatchRequest, SegmentBatchResult } from "@et/core";
import type { BrowserProvider } from "@et/providers/browser";
import { describe, expect, it } from "vitest";
import {
  cancelClientBatches,
  pollClientBatches,
  resultsOf,
  submitChapterBatch,
} from "@/translate/batch-flow";
import { FakeWorkApi } from "./fake-work-api";

const usage = { inputTokens: 4, outputTokens: 5 };

class FakeBatch {
  submitted: BatchRequest[][] = [];
  cancelled: string[] = [];
  next: BatchFetch = { status: "in_progress" };
  id = "vendor-1";
  async submit(requests: BatchRequest[]) {
    this.submitted.push(requests);
    return this.id;
  }
  async fetch() {
    return this.next;
  }
  async cancel(id: string) {
    this.cancelled.push(id);
  }
}

function setup() {
  const api = new FakeWorkApi({
    chapterId: "ch",
    segments: [
      { id: "s0", text: "a" },
      { id: "s1", text: "b" },
      { id: "s2", text: "c" },
    ],
  });
  api.plan = {
    units: [
      {
        customId: "0",
        sourceLang: "ja",
        target: getTargetLanguage("en"),
        bookTitle: "B",
        context: [],
        segments: [
          { id: "s0", text: "a" },
          { id: "s1", text: "b" },
        ],
        instructions: "terse",
      },
      {
        customId: "1",
        sourceLang: "ja",
        target: getTargetLanguage("en"),
        bookTitle: "B",
        context: [],
        segments: [{ id: "s2", text: "c" }],
      },
    ],
  };
  const batch = new FakeBatch();
  const deps = {
    api,
    bundleFor: () => ({ batch }) as unknown as BrowserProvider,
  };
  return { api, batch, deps };
}

describe("batch flow", () => {
  it("submits the planned units from the browser and records only ids", async () => {
    const { api, batch, deps } = setup();
    expect(await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" })).toBe(
      true,
    );
    expect(batch.submitted[0]?.map((r) => [r.customId, r.request.model])).toEqual([
      ["0", "m"],
      ["1", "m"],
    ]);
    expect(batch.submitted[0]?.[0]?.request.instructions).toBe("terse");
    expect(api.batches[0]).toMatchObject({
      vendorBatchId: "vendor-1",
      segmentIds: [["s0", "s1"], ["s2"]],
    });
  });

  it("does nothing when there is nothing left to plan", async () => {
    const { api, batch, deps } = setup();
    api.plan = { units: [] };
    expect(await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" })).toBe(
      false,
    );
    expect(batch.submitted).toHaveLength(0);
  });

  it("cancels the vendor batch when recording it fails", async () => {
    const { api, batch, deps } = setup();
    api.recordBatch = async () => {
      throw new Error("conflict");
    };
    await expect(
      submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" }),
    ).rejects.toThrow("conflict");
    expect(batch.cancelled).toEqual(["vendor-1"]);
  });

  it("leaves an in-progress batch alone", async () => {
    const { api, deps } = setup();
    await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" });
    const out = await pollClientBatches(deps, "j1", (_p, t) => t);
    expect(out.progress).toEqual([]);
    expect(api.batchPosts).toEqual([]);
  });

  it("posts finished results, failing ids the vendor did not answer", async () => {
    const { api, batch, deps } = setup();
    await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" });
    batch.next = {
      status: "ended",
      results: new Map<string, SegmentBatchResult>([
        ["0", { kind: "ok", segments: [{ id: "s0", text: "A" }], usage }],
        ["1", { kind: "refused", usage, category: "policy" }],
      ]),
    };
    const out = await pollClientBatches(deps, "j1", (_p, t) => t);
    expect(out.progress).toHaveLength(1);
    const posted = api.batchPosts[0]?.segments ?? [];
    expect(posted.map((s) => [s.id, s.status])).toEqual([
      ["s0", "done"],
      ["s1", "failed"],
      ["s2", "failed"],
    ]);
    expect(posted[2]?.note).toContain("policy");
  });

  it("reports a failed batch with a redacted reason", async () => {
    const { api, batch, deps } = setup();
    await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" });
    batch.next = { status: "failed", cause: "expired sk-fake-secret" };
    await pollClientBatches(deps, "j1", (_p, t) => t.replace("sk-fake-secret", "[redacted]"));
    expect(api.ended).toEqual([{ id: "batch-1", status: "failed", error: "expired [redacted]" }]);
  });

  it("waits for the keys instead of polling when the vault is locked", async () => {
    const { api, deps } = setup();
    await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" });
    const out = await pollClientBatches({ ...deps, bundleFor: () => null }, "j1", (_p, t) => t);
    expect(out).toEqual({ progress: [], waitingOnKeys: true });
    expect(api.batchPosts).toEqual([]);
  });

  it("cancels open batches at the vendor and on the server", async () => {
    const { api, batch, deps } = setup();
    await submitChapterBatch(deps, "j1", "ch", { provider: "anthropic", model: "m" });
    await cancelClientBatches(deps, "j1");
    expect(batch.cancelled).toEqual(["vendor-1"]);
    expect(api.ended[0]?.status).toBe("cancelled");
  });

  it("resultsOf sums usage across splits", () => {
    const out = resultsOf(
      [["a"], ["b"]],
      new Map<string, SegmentBatchResult>([
        ["0", { kind: "ok", segments: [{ id: "a", text: "x" }], usage }],
        ["1", { kind: "truncated", usage }],
      ]),
    );
    expect(out.usage).toEqual({ inputTokens: 8, outputTokens: 10 });
  });
});
