import Anthropic from "@anthropic-ai/sdk";
import { ApiError } from "@google/genai";
import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { mapAnthropicError } from "../src/anthropic.ts";
import { mapGeminiError } from "../src/gemini.ts";
import { mapOpenAIError } from "../src/openai.ts";

const headers = (init: Record<string, string> = {}) => new Headers(init);

describe("mapAnthropicError", () => {
  it("maps 429 to retryable with retryAfterMs", () => {
    const err = new Anthropic.RateLimitError(
      429,
      undefined,
      "slow down",
      headers({ "retry-after": "7" }),
    );
    expect(mapAnthropicError(err)).toEqual({
      kind: "retryable",
      retryAfterMs: 7000,
      cause: expect.stringContaining("429"),
    });
  });

  it("prefers retry-after-ms when present", () => {
    const err = new Anthropic.RateLimitError(
      429,
      undefined,
      "slow",
      headers({ "retry-after-ms": "250", "retry-after": "7" }),
    );
    expect(mapAnthropicError(err)).toMatchObject({ kind: "retryable", retryAfterMs: 250 });
  });

  it("maps 529 overloaded and 500 to retryable", () => {
    expect(
      mapAnthropicError(new Anthropic.InternalServerError(529, undefined, "overloaded", headers())),
    ).toMatchObject({ kind: "retryable" });
    expect(
      mapAnthropicError(new Anthropic.InternalServerError(500, undefined, "boom", headers())),
    ).toMatchObject({ kind: "retryable" });
  });

  it("maps connection failures and timeouts to retryable", () => {
    expect(mapAnthropicError(new Anthropic.APIConnectionError({ message: "down" }))).toMatchObject({
      kind: "retryable",
    });
    expect(mapAnthropicError(new Anthropic.APIConnectionTimeoutError())).toMatchObject({
      kind: "retryable",
    });
  });

  it("maps 401 to fatal", () => {
    const err = new Anthropic.AuthenticationError(401, undefined, "bad key", headers());
    expect(mapAnthropicError(err)).toEqual({
      kind: "fatal",
      cause: expect.stringContaining("401"),
    });
  });

  it("maps 400, 403 and 404 to fatal", () => {
    expect(
      mapAnthropicError(new Anthropic.BadRequestError(400, undefined, "x", headers())).kind,
    ).toBe("fatal");
    expect(
      mapAnthropicError(new Anthropic.PermissionDeniedError(403, undefined, "x", headers())).kind,
    ).toBe("fatal");
    expect(
      mapAnthropicError(new Anthropic.NotFoundError(404, undefined, "x", headers())).kind,
    ).toBe("fatal");
  });

  it("maps unknown errors to fatal", () => {
    expect(mapAnthropicError(new Error("weird")).kind).toBe("fatal");
  });
});

describe("mapOpenAIError", () => {
  it("maps 429 to retryable with retryAfterMs", () => {
    const err = new OpenAI.RateLimitError(429, undefined, "slow", headers({ "retry-after": "3" }));
    expect(mapOpenAIError(err)).toMatchObject({ kind: "retryable", retryAfterMs: 3000 });
  });

  it("maps 503 and connection errors to retryable", () => {
    expect(
      mapOpenAIError(new OpenAI.InternalServerError(503, undefined, "x", headers())).kind,
    ).toBe("retryable");
    expect(mapOpenAIError(new OpenAI.APIConnectionError({ message: "down" })).kind).toBe(
      "retryable",
    );
  });

  it("maps 401 to fatal", () => {
    expect(
      mapOpenAIError(new OpenAI.AuthenticationError(401, undefined, "bad", headers())).kind,
    ).toBe("fatal");
  });
});

describe("mapGeminiError", () => {
  it("maps 429 to retryable", () => {
    expect(mapGeminiError(new ApiError({ message: "quota", status: 429 })).kind).toBe("retryable");
  });

  it("maps 503 to retryable", () => {
    expect(mapGeminiError(new ApiError({ message: "unavailable", status: 503 })).kind).toBe(
      "retryable",
    );
  });

  it("maps 401, 403, 404 and 400 to fatal", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(mapGeminiError(new ApiError({ message: "x", status })).kind).toBe("fatal");
    }
  });

  it("maps network failures to retryable", () => {
    expect(mapGeminiError(new TypeError("fetch failed")).kind).toBe("retryable");
  });

  it("maps programming errors to fatal instead of retrying them", () => {
    expect(mapGeminiError(new RangeError("bad index")).kind).toBe("fatal");
  });
});

describe("auth failures", () => {
  it("never echo the provider's message, which can contain a masked key", () => {
    const results = [
      mapOpenAIError(
        new OpenAI.AuthenticationError(
          401,
          undefined,
          "Incorrect API key provided: sk-…abcd",
          headers(),
        ),
      ),
      mapAnthropicError(
        new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key sk-ant-…", headers()),
      ),
      mapGeminiError(new ApiError({ message: "API key not valid: AIza…", status: 403 })),
    ];
    for (const r of results) {
      expect(r).toMatchObject({ kind: "fatal" });
      expect(r.cause).not.toMatch(/sk-|AIza/);
      expect(r.cause).toMatch(/API key/);
    }
  });
});
