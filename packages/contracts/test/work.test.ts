import { describe, expect, it } from "vitest";
import {
  BatchPlanQuerySchema,
  BatchPlanSchema,
  BatchResultsBodySchema,
  BatchStatusBodySchema,
  ChapterViewSchema,
  RecordBatchBodySchema,
  WorkResultBodySchema,
} from "../src/index.ts";

const result = { id: "a#0", text: "t", status: "done" as const };
const usage = { inputTokens: 1, outputTokens: 2 };

describe("work protocol bodies", () => {
  it("accept well-formed results", () => {
    expect(
      WorkResultBodySchema.safeParse({ leaseId: "l", segments: [result], usage }).success,
    ).toBe(true);
  });

  it.each([
    ["apiKey", { apiKey: "sk-fake" }],
    ["key", { key: "sk-fake" }],
    ["x-provider-key", { "x-provider-key": "sk-fake" }],
  ])("reject an extra %s field at the top level", (_name, extra) => {
    expect(
      WorkResultBodySchema.safeParse({ leaseId: "l", segments: [result], usage, ...extra }).success,
    ).toBe(false);
    expect(
      BatchResultsBodySchema.safeParse({ segments: [result], usage, final: true, ...extra })
        .success,
    ).toBe(false);
    expect(BatchStatusBodySchema.safeParse({ status: "failed", ...extra }).success).toBe(false);
    expect(
      RecordBatchBodySchema.safeParse({
        chapterId: "c",
        provider: "openai",
        model: "m",
        vendorBatchId: "v",
        segmentIds: [["a#0"]],
        ...extra,
      }).success,
    ).toBe(false);
  });

  it("rejects extra fields nested in segments and usage", () => {
    expect(
      WorkResultBodySchema.safeParse({
        leaseId: "l",
        segments: [{ ...result, apiKey: "sk-fake" }],
        usage,
      }).success,
    ).toBe(false);
    expect(
      WorkResultBodySchema.safeParse({
        leaseId: "l",
        segments: [result],
        usage: { ...usage, apiKey: "sk-fake" },
      }).success,
    ).toBe(false);
  });

  it("rejects negative or fractional usage", () => {
    const bad = { leaseId: "l", segments: [], usage: { inputTokens: -1, outputTokens: 0.5 } };
    expect(WorkResultBodySchema.safeParse(bad).success).toBe(false);
  });
});

describe("large-chapter protocol", () => {
  it("accepts a results chunk of 1000 segments and rejects 1001", () => {
    const chunk = (n: number) => ({
      segments: Array.from({ length: n }, (_, i) => ({ ...result, id: `a#${i}` })),
      usage,
      final: false,
    });
    expect(BatchResultsBodySchema.safeParse(chunk(1000)).success).toBe(true);
    expect(BatchResultsBodySchema.safeParse(chunk(1001)).success).toBe(false);
  });

  it("requires the final flag on a results chunk", () => {
    expect(BatchResultsBodySchema.safeParse({ segments: [result], usage }).success).toBe(false);
  });

  it("shares the prompt fields once in a batch plan page", () => {
    const plan = {
      shared: {
        sourceLang: "ja",
        target: { code: "en", name: "English", dir: "ltr", writingMode: "horizontal-tb" },
        bookTitle: "B",
        context: [],
      },
      units: [{ customId: "0", segments: [{ id: "a#0", text: "x" }] }],
      nextOffset: null,
    };
    expect(BatchPlanSchema.safeParse(plan).success).toBe(true);
    expect(BatchPlanQuerySchema.parse({}).offset).toBe(0);
    expect(BatchPlanQuerySchema.parse({ offset: "40" }).offset).toBe(40);
  });

  it("requires part and partCount on a chapter view", () => {
    const view = {
      chapterId: "c",
      index: 0,
      title: "t",
      prevChapterId: null,
      nextChapterId: null,
      blocks: [],
    };
    expect(ChapterViewSchema.safeParse(view).success).toBe(false);
    expect(ChapterViewSchema.safeParse({ ...view, part: 0, partCount: 3 }).success).toBe(true);
  });
});
