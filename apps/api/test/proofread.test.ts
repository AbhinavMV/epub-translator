import {
  BookSummarySchema,
  ChapterProofreadSchema,
  JobSummarySchema,
  ProofreadInputSchema,
  ProofreadRunSchema,
  ProofreadSummarySchema,
} from "@et/contracts";
import type { EpubParser, ParsedBook } from "@et/core";
import { FakeProvider } from "@et/providers";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app.ts";
import { createLocalServices } from "../src/compose-local.ts";

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: null,
  chapters: [{ id: "ch-0", index: 0, title: "第一章", docHrefs: ["a.xhtml"] }],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一" },
    { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: "<1>二</1>" },
  ],
};

const parser: EpubParser = { parse: async () => parsed };
const unused = async () => {
  throw new Error("unused");
};

async function setup() {
  const services = createLocalServices({
    dataDir: ":memory:",
    env: {},
    epub: {
      parser,
      assets: { read: unused },
      renderer: { render: unused },
      exporter: { export: unused },
    },
    fakeProvider: new FakeProvider(),
  });
  const app = createApp(services);
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1])], "b.epub", { type: "application/epub+zip" }));
  const book = BookSummarySchema.parse(
    await (await app.request("/api/books", { method: "POST", body: form })).json(),
  );
  const job = JobSummarySchema.parse(
    await (await app.request(`/api/books/${book.id}/workspace?targetLang=en`)).json(),
  );
  await services.repos.translations.put(job.id, "a.xhtml#0", { text: "One  too", status: "done" });
  await services.repos.translations.put(job.id, "a.xhtml#1", {
    text: "<1>Two</1>",
    status: "done",
  });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
  return { app, services, jobId: job.id, json };
}

describe("proofreading api", () => {
  it("proofreads a chapter on the server and lists it as pending", async () => {
    const { jobId, json } = await setup();
    const res = await json("POST", `/api/jobs/${jobId}/chapters/ch-0/proofread`, {
      provider: "fake",
      model: "fake-echo",
    });
    expect(res.status).toBe(200);
    const run = ProofreadRunSchema.parse(await res.json());
    expect(run.proofread.suggestions).toEqual([
      {
        segmentId: "a.xhtml#0",
        kind: "fluency",
        before: "One  too",
        after: "One too",
        reason: "Collapse doubled spaces",
        state: "pending",
      },
    ]);
    const list = z
      .array(ProofreadSummarySchema)
      .parse(await (await json("GET", `/api/jobs/${jobId}/proofreads`)).json());
    expect(list).toMatchObject([{ chapterId: "ch-0", pending: 1, total: 1 }]);
  });

  it("serves browser input, records vetted edits and applies decisions", async () => {
    const { jobId, json, services } = await setup();
    const input = ProofreadInputSchema.parse(
      await (await json("GET", `/api/jobs/${jobId}/chapters/ch-0/proofread/input`)).json(),
    );
    expect(input.parts.flat().map((s) => s.id)).toEqual(["a.xhtml#0", "a.xhtml#1"]);

    const recorded = await json("PUT", `/api/jobs/${jobId}/chapters/ch-0/proofread`, {
      model: "m",
      usage: { inputTokens: 7, outputTokens: 3 },
      edits: [
        { id: "a.xhtml#0", kind: "accuracy", text: "One too.", reason: "r" },
        { id: "a.xhtml#1", kind: "accuracy", text: "Two", reason: "drops the tags" },
      ],
    });
    expect(ChapterProofreadSchema.parse(await recorded.json()).suggestions).toHaveLength(1);

    const decided = await json("POST", `/api/jobs/${jobId}/chapters/ch-0/proofread/decisions`, {
      accept: ["a.xhtml#0"],
    });
    expect(ChapterProofreadSchema.parse(await decided.json()).suggestions[0]?.state).toBe(
      "accepted",
    );
    expect(await services.repos.translations.get(jobId, "a.xhtml#0")).toEqual({
      text: "One too.",
      status: "done",
    });

    expect((await json("DELETE", `/api/jobs/${jobId}/chapters/ch-0/proofread`)).status).toBe(204);
    expect((await json("GET", `/api/jobs/${jobId}/chapters/ch-0/proofread`)).status).toBe(404);
  });

  it("rejects an unconfigured provider and a malformed body", async () => {
    const { jobId, json } = await setup();
    const unconfigured = await json("POST", `/api/jobs/${jobId}/chapters/ch-0/proofread`, {
      provider: "openai",
      model: "x",
    });
    expect(unconfigured.status).toBe(400);
    const malformed = await json("PUT", `/api/jobs/${jobId}/chapters/ch-0/proofread`, {
      edits: "nope",
    });
    expect(malformed.status).toBe(400);
  });
});
