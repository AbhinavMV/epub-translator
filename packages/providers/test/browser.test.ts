import { getTargetLanguage } from "@et/contracts";
import type { SegmentBatchRequest } from "@et/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserProvider, redactKey } from "../src/browser.ts";

const KEY = "sk-fake-1234567890abcdefWXYZ";

const req: SegmentBatchRequest = {
  model: "m",
  sourceLang: "ja",
  target: getTargetLanguage("en"),
  bookTitle: "B",
  context: [],
  segments: [{ id: "s1", text: "一" }],
};

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("redactKey", () => {
  it("removes the exact key wherever it appears", () => {
    expect(redactKey(`bad ${KEY} and ${KEY}`, KEY)).toBe("bad [redacted] and [redacted]");
  });

  it("removes masked forms that end in the last four characters", () => {
    expect(redactKey("Incorrect API key provided: sk-fake…WXYZ.", KEY)).toBe(
      "Incorrect API key provided: [redacted].",
    );
    expect(redactKey("key sk-fake...WXYZ rejected", KEY)).toBe("key [redacted] rejected");
    expect(redactKey("key ****WXYZ rejected", KEY)).toBe("key [redacted] rejected");
  });

  it("removes url-encoded and json-escaped forms", () => {
    const odd = 'sk-odd"key/with+chars-123456';
    expect(redactKey(`q=${encodeURIComponent(odd)}`, odd)).toBe("q=[redacted]");
    expect(redactKey(JSON.stringify({ k: odd }), odd)).toBe('{"k":"[redacted]"}');
  });

  it("removes well-known key shapes even when the key is not known", () => {
    expect(redactKey("sk-ant-api03-abcDEF_123 sk-proj-abcdefgh1234", "")).toBe(
      "[redacted] [redacted]",
    );
    expect(redactKey(`AIza${"a".repeat(35)}`, "")).toBe("[redacted]");
  });

  it("leaves unrelated text alone", () => {
    expect(redactKey("HTTP 429: slow down", KEY)).toBe("HTTP 429: slow down");
  });
});

describe("browser providers", () => {
  it("anthropic: sends the browser-access header, never retries, and redacts errors", async () => {
    const { calls, fetchMock } = stubFetch(500, {
      type: "error",
      error: { type: "api_error", message: `boom for ${KEY}` },
    });
    const { provider } = createBrowserProvider("anthropic", KEY, "m");
    const result = await provider.translateSegments(req, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0]?.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(result.kind).toBe("retryable");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("anthropic: maps a 401 to a fatal result without server-only hints", async () => {
    stubFetch(401, { type: "error", error: { type: "authentication_error", message: KEY } });
    const { provider } = createBrowserProvider("anthropic", KEY, "m");
    const result = await provider.translateSegments(req, new AbortController().signal);
    expect(result).toMatchObject({ kind: "fatal" });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain("apps/api/.env");
  });

  it("openai: never retries and redacts a masked key echoed by the provider", async () => {
    const { fetchMock } = stubFetch(400, {
      error: { message: "Incorrect API key provided: sk-fake…WXYZ", type: "invalid_request" },
    });
    const { provider } = createBrowserProvider("openai", KEY, "gpt-x");
    const result = await provider.translateSegments(req, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "fatal" });
    expect(JSON.stringify(result)).not.toContain("WXYZ");
  });

  it("gemini: keeps the key out of the url and redacts errors", async () => {
    const { calls } = stubFetch(403, { error: { code: 403, message: `denied ${KEY}` } });
    const { provider } = createBrowserProvider("gemini", KEY, "gemini-x");
    const result = await provider.translateSegments(req, new AbortController().signal);
    expect(calls[0]?.url).not.toContain(KEY);
    expect(result).toMatchObject({ kind: "fatal" });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("redacts the key from a thrown batch error and from term-extraction results", async () => {
    stubFetch(500, { type: "error", error: { type: "api_error", message: KEY } });
    const { batch, terms } = createBrowserProvider("anthropic", KEY, "m");
    const failure = await batch.submit([{ customId: "0", request: req }]).catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(KEY);
    const extracted = await terms.extractTerms(
      {
        model: "m",
        sourceLang: "ja",
        target: getTargetLanguage("en"),
        bookTitle: "B",
        sample: "x",
        existing: [],
      },
      new AbortController().signal,
    );
    expect(JSON.stringify(extracted)).not.toContain(KEY);
  });

  it("does not write the key to the console", async () => {
    stubFetch(500, { type: "error", error: { type: "api_error", message: "x" } });
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    for (const id of ["anthropic", "openai", "gemini"] as const) {
      await createBrowserProvider(id, KEY, "m").provider.translateSegments(
        req,
        new AbortController().signal,
      );
    }
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
  });

  it("propagates aborts untouched", async () => {
    stubFetch(500, {});
    const controller = new AbortController();
    controller.abort();
    const { provider } = createBrowserProvider("anthropic", KEY, "m");
    await expect(provider.translateSegments(req, controller.signal)).rejects.toThrow();
  });
});
