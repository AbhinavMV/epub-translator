import { describe, expect, it } from "vitest";
import { completionToResult } from "../src/completion.ts";
import { parseSegmentsJson, SEGMENTS_JSON_SCHEMA } from "../src/schema.ts";

const usage = { inputTokens: 3, outputTokens: 4 };

describe("SEGMENTS_JSON_SCHEMA", () => {
  it("requires an id and text per segment and forbids extra properties", () => {
    expect(SEGMENTS_JSON_SCHEMA).toEqual({
      type: "object",
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, text: { type: "string" } },
            required: ["id", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["segments"],
      additionalProperties: false,
    });
  });
});

describe("parseSegmentsJson", () => {
  it("parses a valid payload", () => {
    expect(parseSegmentsJson('{"segments":[{"id":"a","text":"Hi"}]}')).toEqual([
      { id: "a", text: "Hi" },
    ]);
  });

  it("returns no segments for malformed JSON", () => {
    expect(parseSegmentsJson("{not json")).toEqual([]);
  });

  it("returns no segments when the shape is wrong", () => {
    expect(parseSegmentsJson('{"segments":[{"id":1}]}')).toEqual([]);
    expect(parseSegmentsJson('{"items":[]}')).toEqual([]);
  });

  it("accepts a payload wrapped in a markdown fence", () => {
    expect(parseSegmentsJson('```json\n{"segments":[{"id":"a","text":"x"}]}\n```')).toEqual([
      { id: "a", text: "x" },
    ]);
  });
});

describe("completionToResult", () => {
  it("turns text into ok segments", () => {
    expect(
      completionToResult({ kind: "text", text: '{"segments":[{"id":"a","text":"x"}]}', usage }),
    ).toEqual({ kind: "ok", segments: [{ id: "a", text: "x" }], usage });
  });

  it("treats unparseable text as an ok result with no segments so the translator retries", () => {
    expect(completionToResult({ kind: "text", text: "sorry", usage })).toEqual({
      kind: "ok",
      segments: [],
      usage,
    });
  });

  it("passes truncated and refused through", () => {
    expect(completionToResult({ kind: "truncated", usage })).toEqual({ kind: "truncated", usage });
    expect(completionToResult({ kind: "refused", usage })).toEqual({ kind: "refused", usage });
  });
});
