import { describe, expect, it } from "vitest";
import {
  BatchResultsBodySchema,
  BatchStatusBodySchema,
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
    expect(BatchResultsBodySchema.safeParse({ segments: [result], usage, ...extra }).success).toBe(
      false,
    );
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
