import { describe, expect, it } from "vitest";
import { modelName } from "@/lib/model-name";

describe("modelName", () => {
  it.each([
    ["claude-sonnet-5-5", "Claude Sonnet 5.5"],
    ["claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
    ["gpt-5-mini", "GPT-5 mini"],
    ["gpt-5.1", "GPT-5.1"],
    ["gpt-4o", "GPT-4o"],
    ["gemini-2.5-flash", "Gemini 2.5 Flash"],
    ["gemini-3-pro", "Gemini 3 Pro"],
    ["fake-1", "Fake 1"],
  ])("names %s as %s", (id, name) => {
    expect(modelName(id)).toBe(name);
  });
});
