import { getTargetLanguage } from "@et/contracts";
import { validateTokens } from "@et/core";
import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/fake.ts";
import { buildProviderRegistry } from "../src/registry.ts";

const signal = new AbortController().signal;

function request(segments: { id: string; text: string }[]) {
  return {
    model: "fake-echo",
    sourceLang: "ja",
    target: getTargetLanguage("en"),
    bookTitle: "B",
    context: [],
    segments,
  };
}

describe("FakeProvider", () => {
  it("fake provider preserves tokens", async () => {
    const source = "<1>こんにちは</1>、世界<x2/>。";
    const result = await new FakeProvider().translateSegments(
      request([{ id: "a", text: source }]),
      signal,
    );
    if (result.kind !== "ok") throw new Error("expected ok");
    const text = result.segments[0]?.text ?? "";
    expect(text).toBe("<1>[en] こんにちは</1>[en] 、世界<x2/>[en] 。");
    expect(validateTokens(source, text)).toBeNull();
  });

  it("prefixes plain text and keeps ids in order", async () => {
    const result = await new FakeProvider().translateSegments(
      request([
        { id: "a", text: "x" },
        { id: "b", text: "y" },
      ]),
      signal,
    );
    expect(result).toMatchObject({
      kind: "ok",
      segments: [
        { id: "a", text: "[en] x" },
        { id: "b", text: "[en] y" },
      ],
    });
  });

  it("lists one model and identifies itself", async () => {
    const provider = new FakeProvider();
    expect(provider.id).toBe("fake");
    expect(provider.label).toBe("Offline test (no translation)");
    expect(await provider.listModels()).toEqual(["fake-echo"]);
  });

  it("honours an abort while delaying", async () => {
    const controller = new AbortController();
    const pending = new FakeProvider({ delayMs: 10_000 }).translateSegments(
      request([{ id: "a", text: "x" }]),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("buildProviderRegistry", () => {
  it("registry marks providers configured only when key present and always includes fake", () => {
    const none = buildProviderRegistry({});
    expect([...none.keys()]).toEqual(["anthropic", "openai", "gemini", "fake"]);
    expect(none.get("anthropic")).toMatchObject({ provider: null, configured: false });
    expect(none.get("fake")).toMatchObject({ configured: true, defaultModel: "fake-echo" });
    expect(none.get("fake")?.provider?.id).toBe("fake");

    const some = buildProviderRegistry({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "" });
    expect(some.get("anthropic")?.configured).toBe(true);
    expect(some.get("anthropic")?.provider?.id).toBe("anthropic");
    expect(some.get("openai")?.configured).toBe(false);
  });

  it("defaults anthropic to claude-sonnet-5-5 and honours model overrides", () => {
    const reg = buildProviderRegistry({
      ANTHROPIC_API_KEY: "k",
      OPENAI_API_KEY: "k",
      OPENAI_MODEL: "gpt-x",
      GEMINI_API_KEY: "k",
    });
    expect(reg.get("anthropic")?.defaultModel).toBe("claude-sonnet-5-5");
    expect(reg.get("openai")?.defaultModel).toBe("gpt-x");
    expect(reg.get("gemini")?.defaultModel).toBe("");
  });
});
