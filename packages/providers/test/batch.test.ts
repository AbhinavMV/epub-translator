import type Anthropic from "@anthropic-ai/sdk";
import { getTargetLanguage } from "@et/contracts";
import type { BatchRequest, SegmentBatchRequest } from "@et/core";
import type { GoogleGenAI } from "@google/genai";
import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { anthropicParams } from "../src/anthropic.ts";
import { AnthropicBatchProvider } from "../src/batch/anthropic.ts";
import { FakeBatchProvider } from "../src/batch/fake.ts";
import { GeminiBatchProvider } from "../src/batch/gemini.ts";
import { OpenAIBatchProvider } from "../src/batch/openai.ts";
import { geminiRequest } from "../src/gemini.ts";
import { openaiParams } from "../src/openai.ts";
import { buildProviderRegistry } from "../src/registry.ts";

const request = (ids: string[], model = "m1"): SegmentBatchRequest => ({
  model,
  sourceLang: "ja",
  target: getTargetLanguage("en"),
  bookTitle: "B",
  context: [{ source: "前", target: "Before" }],
  segments: ids.map((id) => ({ id, text: `<1>${id}</1>` })),
  instructions: "British spelling",
});

const requests: BatchRequest[] = [
  { customId: "0", request: request(["a"]) },
  { customId: "1", request: request(["b", "c"]) },
];

const payload = (pairs: [string, string][]) =>
  JSON.stringify({ segments: pairs.map(([id, text]) => ({ id, text })) });

async function* lines<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

describe("AnthropicBatchProvider", () => {
  class FakeBatches {
    created: unknown[] = [];
    cancelled: string[] = [];
    status: "in_progress" | "canceling" | "ended" = "in_progress";
    responses: unknown[] = [];
    async create(params: unknown) {
      this.created.push(params);
      return { id: "msgbatch_1" };
    }
    async retrieve() {
      return { processing_status: this.status };
    }
    async results() {
      return lines(this.responses);
    }
    async cancel(id: string) {
      this.cancelled.push(id);
      return {};
    }
  }
  const make = () => {
    const batches = new FakeBatches();
    const client = { messages: { batches } } as unknown as Anthropic;
    return { batches, provider: new AnthropicBatchProvider("default-model", client) };
  };
  const message = (text: string, stop = "end_turn") => ({
    type: "succeeded",
    message: {
      stop_reason: stop,
      content: [{ type: "text", text }],
      usage: { input_tokens: 10, output_tokens: 4 },
    },
  });

  it("submits each request with the live request's parameters and its custom id", async () => {
    const { batches, provider } = make();
    const id = await provider.submit(requests);
    expect(id).toBe("msgbatch_1");
    expect(batches.created).toEqual([
      {
        requests: requests.map((r) => ({
          custom_id: r.customId,
          params: anthropicParams(r.request, "default-model"),
        })),
      },
    ]);
    const params = (batches.created[0] as { requests: { params: { system: unknown } }[] })
      .requests[0]?.params;
    expect(params?.system).toEqual([
      expect.objectContaining({ cache_control: { type: "ephemeral" } }),
    ]);
  });

  it("reports in_progress until the batch has ended", async () => {
    const { batches, provider } = make();
    expect(await provider.fetch("msgbatch_1")).toEqual({ status: "in_progress" });
    batches.status = "canceling";
    expect(await provider.fetch("msgbatch_1")).toEqual({ status: "in_progress" });
  });

  it("maps ended results by custom id whatever order they arrive in", async () => {
    const { batches, provider } = make();
    batches.status = "ended";
    batches.responses = [
      {
        custom_id: "1",
        result: message(
          payload([
            ["b", "B"],
            ["c", "C"],
          ]),
        ),
      },
      { custom_id: "0", result: message(payload([["a", "A"]])) },
      { custom_id: "2", result: message("", "max_tokens") },
      {
        custom_id: "3",
        result: {
          type: "errored",
          error: { error: { type: "invalid_request_error", message: "bad" } },
        },
      },
      { custom_id: "4", result: { type: "expired" } },
    ];
    const fetched = await provider.fetch("msgbatch_1");
    if (fetched.status !== "ended") throw new Error("expected ended");
    expect(fetched.results.get("0")).toEqual({
      kind: "ok",
      segments: [{ id: "a", text: "A" }],
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    expect(fetched.results.get("1")).toMatchObject({ kind: "ok" });
    expect(fetched.results.get("2")).toMatchObject({ kind: "truncated" });
    expect(fetched.results.get("3")).toMatchObject({ kind: "fatal" });
    expect(fetched.results.get("4")).toMatchObject({ kind: "retryable" });
  });

  it("cancels the vendor batch", async () => {
    const { batches, provider } = make();
    await provider.cancel("msgbatch_1");
    expect(batches.cancelled).toEqual(["msgbatch_1"]);
  });
});

describe("OpenAIBatchProvider", () => {
  class FakeOpenAI {
    uploads: { text: string; purpose: string }[] = [];
    batchParams: unknown[] = [];
    cancelled: string[] = [];
    batch: Record<string, unknown> = { status: "in_progress" };
    contents = new Map<string, string>();
    files = {
      create: async (body: { file: File; purpose: string }) => {
        this.uploads.push({ text: await body.file.text(), purpose: body.purpose });
        return { id: "file-in" };
      },
      content: async (id: string) => new Response(this.contents.get(id) ?? ""),
    };
    batches = {
      create: async (params: unknown) => {
        this.batchParams.push(params);
        return { id: "batch_1" };
      },
      retrieve: async () => this.batch,
      cancel: async (id: string) => {
        this.cancelled.push(id);
        return {};
      },
    };
  }
  const make = () => {
    const client = new FakeOpenAI();
    return {
      client,
      provider: new OpenAIBatchProvider("default-model", client as unknown as OpenAI),
    };
  };
  const output = (customId: string, text: string, status = "completed") =>
    JSON.stringify({
      custom_id: customId,
      response: {
        status_code: 200,
        body: {
          status,
          output: [{ type: "message", content: [{ type: "output_text", text }] }],
          usage: { input_tokens: 9, output_tokens: 3 },
        },
      },
      error: null,
    });

  it("uploads a JSONL file of live-identical Responses requests and creates the batch", async () => {
    const { client, provider } = make();
    expect(await provider.submit(requests)).toBe("batch_1");
    expect(client.uploads[0]?.purpose).toBe("batch");
    const jsonl = (client.uploads[0]?.text ?? "")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(jsonl).toEqual(
      requests.map((r) => ({
        custom_id: r.customId,
        method: "POST",
        url: "/v1/responses",
        body: openaiParams(r.request, "default-model"),
      })),
    );
    expect(client.batchParams).toEqual([
      { input_file_id: "file-in", endpoint: "/v1/responses", completion_window: "24h" },
    ]);
  });

  it("stays in progress while OpenAI is validating, running or finalizing", async () => {
    const { client, provider } = make();
    for (const status of ["validating", "in_progress", "finalizing", "cancelling"]) {
      client.batch = { status };
      expect(await provider.fetch("batch_1")).toEqual({ status: "in_progress" });
    }
  });

  it("reads the output file into results keyed by custom id", async () => {
    const { client, provider } = make();
    client.batch = { status: "completed", output_file_id: "file-out", error_file_id: "file-err" };
    client.contents.set(
      "file-out",
      `${output(
        "1",
        payload([
          ["b", "B"],
          ["c", "C"],
        ]),
      )}\n${output("0", payload([["a", "A"]]))}\n`,
    );
    client.contents.set(
      "file-err",
      `${JSON.stringify({ custom_id: "2", response: null, error: { code: "x", message: "boom" } })}\n`,
    );
    const fetched = await provider.fetch("batch_1");
    if (fetched.status !== "ended") throw new Error("expected ended");
    expect(fetched.results.get("0")).toEqual({
      kind: "ok",
      segments: [{ id: "a", text: "A" }],
      usage: { inputTokens: 9, outputTokens: 3 },
    });
    expect(fetched.results.get("1")).toMatchObject({ kind: "ok" });
    expect(fetched.results.get("2")).toMatchObject({
      kind: "fatal",
      cause: expect.stringContaining("boom"),
    });
  });

  it("fails the batch with the vendor's error when OpenAI marks it failed", async () => {
    const { client, provider } = make();
    client.batch = { status: "failed", errors: { data: [{ message: "bad input file" }] } };
    expect(await provider.fetch("batch_1")).toEqual({ status: "failed", cause: "bad input file" });
  });

  it("fails the batch when it expired without producing output", async () => {
    const { client, provider } = make();
    client.batch = { status: "expired" };
    expect(await provider.fetch("batch_1")).toMatchObject({ status: "failed" });
  });

  it("cancels the vendor batch", async () => {
    const { client, provider } = make();
    await provider.cancel("batch_1");
    expect(client.cancelled).toEqual(["batch_1"]);
  });
});

describe("GeminiBatchProvider", () => {
  class FakeGenAI {
    created: unknown[] = [];
    cancelled: unknown[] = [];
    job: Record<string, unknown> = { state: "JOB_STATE_RUNNING" };
    batches = {
      create: async (params: unknown) => {
        this.created.push(params);
        return { name: "batches/abc" };
      },
      get: async () => this.job,
      cancel: async (params: unknown) => {
        this.cancelled.push(params);
      },
    };
  }
  const make = () => {
    const client = new FakeGenAI();
    return {
      client,
      provider: new GeminiBatchProvider("default-model", client as unknown as GoogleGenAI),
    };
  };
  const reply = (text: string) => ({
    candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 },
  });

  it("creates the batch with inlined live-identical requests tagged by custom id", async () => {
    const { client, provider } = make();
    expect(await provider.submit(requests)).toBe("batches/abc");
    expect(client.created).toEqual([
      {
        model: "m1",
        src: requests.map((r) => ({
          contents: geminiRequest(r.request, "default-model").contents,
          config: geminiRequest(r.request, "default-model").config,
          metadata: { key: r.customId },
        })),
      },
    ]);
  });

  it("stays in progress while the job is pending or running", async () => {
    const { client, provider } = make();
    for (const state of ["JOB_STATE_QUEUED", "JOB_STATE_PENDING", "JOB_STATE_RUNNING"]) {
      client.job = { state };
      expect(await provider.fetch("batches/abc")).toEqual({ status: "in_progress" });
    }
  });

  it("maps inlined responses by their metadata key, falling back to position", async () => {
    const { client, provider } = make();
    client.job = {
      state: "JOB_STATE_SUCCEEDED",
      dest: {
        inlinedResponses: [
          {
            response: reply(
              payload([
                ["b", "B"],
                ["c", "C"],
              ]),
            ),
            metadata: { key: "1" },
          },
          { error: { message: "quota" }, metadata: { key: "3" } },
          { response: reply(payload([["a", "A"]])) },
        ],
      },
    };
    const fetched = await provider.fetch("batches/abc");
    if (fetched.status !== "ended") throw new Error("expected ended");
    expect(fetched.results.get("1")).toMatchObject({ kind: "ok" });
    expect(fetched.results.get("2")).toMatchObject({ kind: "ok" });
    expect(fetched.results.get("3")).toMatchObject({ kind: "fatal", cause: "quota" });
    expect(fetched.results.size).toBe(3);
  });

  it("fails the batch for failed, cancelled and expired jobs", async () => {
    const { client, provider } = make();
    client.job = { state: "JOB_STATE_FAILED", error: { message: "boom" } };
    expect(await provider.fetch("batches/abc")).toEqual({ status: "failed", cause: "boom" });
    client.job = { state: "JOB_STATE_EXPIRED" };
    expect(await provider.fetch("batches/abc")).toMatchObject({ status: "failed" });
  });

  it("cancels the vendor batch", async () => {
    const { client, provider } = make();
    await provider.cancel("batches/abc");
    expect(client.cancelled).toEqual([{ name: "batches/abc" }]);
  });
});

describe("buildProviderRegistry batch support", () => {
  it("offers a batch provider for every configured vendor", () => {
    const registry = buildProviderRegistry({
      ANTHROPIC_API_KEY: "a",
      OPENAI_API_KEY: "o",
      GEMINI_API_KEY: "g",
    });
    expect(registry.get("anthropic")?.batch).toBeInstanceOf(AnthropicBatchProvider);
    expect(registry.get("openai")?.batch).toBeInstanceOf(OpenAIBatchProvider);
    expect(registry.get("gemini")?.batch).toBeInstanceOf(GeminiBatchProvider);
  });

  it("offers no batch provider for an unconfigured vendor", () => {
    expect(buildProviderRegistry({}).get("anthropic")?.batch).toBeNull();
  });

  it("offers a fake batch provider alongside the fake live one", () => {
    const registry = buildProviderRegistry({ ENABLE_FAKE_PROVIDER: "1" });
    expect(registry.get("fake")?.batch).toBeInstanceOf(FakeBatchProvider);
  });
});

describe("FakeBatchProvider", () => {
  it("ends after the configured number of fetches with echo results", async () => {
    const provider = new FakeBatchProvider({ endsAfterFetches: 2 });
    const id = await provider.submit(requests);
    expect(await provider.fetch(id)).toEqual({ status: "in_progress" });
    const fetched = await provider.fetch(id);
    if (fetched.status !== "ended") throw new Error("expected ended");
    expect([...fetched.results.keys()].sort()).toEqual(["0", "1"]);
    expect(fetched.results.get("0")).toMatchObject({
      kind: "ok",
      segments: [{ id: "a", text: "<1>[en] a</1>" }],
    });
  });

  it("reports failed for a cancelled batch", async () => {
    const provider = new FakeBatchProvider({ endsAfterFetches: 5 });
    const id = await provider.submit(requests);
    await provider.cancel(id);
    expect(await provider.fetch(id)).toMatchObject({ status: "failed" });
  });
});
