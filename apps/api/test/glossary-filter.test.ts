import {
  BatchPlanSchema,
  BookSummarySchema,
  type GlossaryEntry,
  JobSummarySchema,
  WorkUnitSchema,
} from "@et/contracts";
import type {
  BatchRequest,
  EpubParser,
  ParsedBook,
  ProofreadRequest,
  SegmentBatchRequest,
} from "@et/core";
import { FakeBatchProvider, FakeProofreader, FakeProvider } from "@et/providers";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";

const FILL = "あ".repeat(2500);

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [
    { id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] },
    { id: "ch-1", index: 1, title: "二", docHrefs: ["b.xhtml"] },
  ],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: `シ<1>ャ</1>ルは${FILL}` },
    { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: `王都へ${FILL}` },
    { id: "b.xhtml#0", chapterId: "ch-1", ordinal: 0, sourceText: "空が青い" },
  ],
};

const glossary: GlossaryEntry[] = [
  { source: "シャル", target: "Charlotte" },
  { source: "王都", target: "Royal Capital", note: "the city" },
  { source: "魔王", target: "Demon King" },
];

const unused = async () => {
  throw new Error("unused");
};

class RecordingBatchProvider extends FakeBatchProvider {
  readonly submitted: BatchRequest[] = [];
  override async submit(requests: BatchRequest[]) {
    this.submitted.push(...requests);
    return super.submit(requests);
  }
}

class RecordingProofreader extends FakeProofreader {
  readonly requests: ProofreadRequest[] = [];
  override async proofread(req: ProofreadRequest, signal: AbortSignal) {
    this.requests.push(req);
    return super.proofread(req, signal);
  }
}

class RecordingProvider extends FakeProvider {
  readonly requests: SegmentBatchRequest[] = [];
  override async translateSegments(req: SegmentBatchRequest, signal: AbortSignal) {
    this.requests.push(req);
    return super.translateSegments(req, signal);
  }
}

const send = (method: string, body?: unknown) => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: { "content-type": "application/json" },
});

async function setup() {
  const provider = new RecordingProvider();
  const batch = new RecordingBatchProvider();
  const proofreader = new RecordingProofreader();
  const parser: EpubParser = { parse: async () => parsed };
  const services = createLocalServices({
    dataDir: ":memory:",
    env: {},
    epub: {
      parser,
      assets: { read: unused },
      renderer: { render: unused },
      exporter: { export: unused },
    },
    fakeProvider: provider,
    fakeBatchProvider: batch,
    fakeProofreader: proofreader,
  });
  const app = createApp(services);
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1])], "b.epub", { type: "application/epub+zip" }));
  const book = BookSummarySchema.parse(
    await (await app.request("/api/books", { method: "POST", body: form })).json(),
  );
  const saved = await app.request(
    `/api/projects/${book.projectId}/settings`,
    send("PUT", { customPrompt: "", glossary }),
  );
  expect(saved.status).toBe(200);
  const model = await app.request(
    `/api/books/${book.id}/settings`,
    send("PUT", { provider: "fake", model: "fake-echo" }),
  );
  expect(model.status).toBe(200);
  const job = JobSummarySchema.parse(
    await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
  );
  const translate = async (chapterId: string) => {
    const res = await app.request(
      `/api/jobs/${job.id}/chapters/${chapterId}/translate`,
      send("POST", { provider: "fake", model: "fake-echo" }),
    );
    expect(res.status).toBe(200);
    await services.runner.whenIdle();
  };
  return { app, services, provider, batch, proofreader, jobId: job.id, bookId: book.id, translate };
}

describe("glossary sent with live translation", () => {
  it("sends no glossary when the batch uses none of its terms", async () => {
    const { provider, translate } = await setup();
    await translate("ch-1");
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).not.toHaveProperty("glossary");
  });

  it("sends exactly the entries its segments or context use, ignoring placeholder tags", async () => {
    const { provider, translate } = await setup();
    await translate("ch-0");
    expect(provider.requests.map((r) => r.glossary)).toEqual([
      [{ source: "シャル", target: "Charlotte" }],
      [
        { source: "シャル", target: "Charlotte" },
        { source: "王都", target: "Royal Capital", note: "the city" },
      ],
    ]);
  });
});

describe("glossary sent with hosted work units", () => {
  it("includes entries used only by the context", async () => {
    const { app, services, jobId } = await setup();
    await services.repos.translations.put(jobId, "a.xhtml#0", {
      text: "Charlotte laughed",
      status: "done",
    });
    const res = await app.request(`/api/jobs/${jobId}/chapters/ch-0/lease`, send("POST"));
    const unit = WorkUnitSchema.parse(await res.json());
    expect(unit.segments.map((s) => s.id)).toEqual(["a.xhtml#1"]);
    expect(unit.glossary?.map((g) => g.source)).toEqual(["シャル", "王都"]);
  });

  it("leaves the glossary off a unit that uses none of its terms", async () => {
    const { app, jobId } = await setup();
    const res = await app.request(`/api/jobs/${jobId}/chapters/ch-1/lease`, send("POST"));
    expect(WorkUnitSchema.parse(await res.json())).not.toHaveProperty("glossary");
  });
});

describe("glossary sent with proofreading", () => {
  it("sends each part only the entries its source text uses", async () => {
    const { app, services, proofreader, jobId } = await setup();
    for (const id of ["a.xhtml#0", "a.xhtml#1", "b.xhtml#0"]) {
      await services.repos.translations.put(jobId, id, { text: "done", status: "done" });
    }
    for (const chapterId of ["ch-0", "ch-1"]) {
      const res = await app.request(
        `/api/jobs/${jobId}/chapters/${chapterId}/proofread`,
        send("POST", { provider: "fake", model: "fake-echo" }),
      );
      expect(res.status).toBe(200);
    }
    expect(proofreader.requests.map((r) => r.glossary.map((g) => g.source))).toEqual([
      ["シャル", "王都"],
      [],
    ]);
  });
});

describe("glossary sent with batch submission", () => {
  it("gives each planned unit only the entries it uses", async () => {
    const { app, jobId } = await setup();
    const res = await app.request(`/api/jobs/${jobId}/chapters/ch-0/batch-plan`, send("POST"));
    const plan = BatchPlanSchema.parse(await res.json());
    expect(plan.shared).not.toHaveProperty("glossary");
    expect(plan.units.map((u) => u.glossary?.map((g) => g.source))).toEqual([["シャル"], ["王都"]]);
  });

  it("sends the batch provider only the entries each request uses", async () => {
    const { app, services, jobId, batch } = await setup();
    const res = await app.request(
      `/api/jobs/${jobId}/chapters/ch-0/translate`,
      send("POST", { provider: "fake", model: "fake-echo", mode: "batch" }),
    );
    expect(res.status).toBe(200);
    await services.runner.whenIdle();
    expect(batch.submitted.map((r) => r.request.glossary?.map((g) => g.source))).toEqual([
      ["シャル"],
      ["王都"],
    ]);
  });
});
