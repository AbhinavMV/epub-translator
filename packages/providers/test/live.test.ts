import { getTargetLanguage } from "@et/contracts";
import { validateTokens } from "@et/core";
import { describe, expect, it } from "vitest";
import { buildProviderRegistry } from "../src/registry.ts";

const live = process.env.LIVE === "1";
const registry = buildProviderRegistry(process.env);
const segments = [
  { id: "a", text: "<1>吾輩</1>は猫である。" },
  { id: "b", text: "名前はまだ無い。" },
];

describe.skipIf(!live)("live providers", () => {
  for (const id of ["anthropic", "openai", "gemini"] as const) {
    const entry = registry.get(id);
    it.skipIf(!entry?.configured)(
      `${id} translates two Japanese segments`,
      async () => {
        const provider = entry?.provider;
        if (!provider) throw new Error("not configured");
        const model = entry.defaultModel || (await provider.listModels())[0] || "";
        const result = await provider.translateSegments(
          {
            model,
            sourceLang: "ja",
            target: getTargetLanguage("en"),
            bookTitle: "Smoke",
            context: [],
            segments,
          },
          AbortSignal.timeout(60_000),
        );
        if (result.kind !== "ok") throw new Error(JSON.stringify(result));
        expect(result.segments.map((s) => s.id)).toEqual(["a", "b"]);
        expect(validateTokens(segments[0]?.text ?? "", result.segments[0]?.text ?? "")).toBeNull();
      },
      90_000,
    );
  }
});
