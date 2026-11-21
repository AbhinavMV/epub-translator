import { describe, expect, it } from "vitest";
import { ChapterStatusSchema, RenameProjectBodySchema, TranslateBodySchema } from "../src/index.ts";

describe("TranslateBodySchema", () => {
  it("defaults mode to live", () => {
    expect(TranslateBodySchema.parse({ provider: "fake", model: "m" }).mode).toBe("live");
  });

  it("accepts batch mode", () => {
    expect(TranslateBodySchema.parse({ provider: "fake", model: "m", mode: "batch" }).mode).toBe(
      "batch",
    );
  });

  it("rejects an unknown mode", () => {
    expect(TranslateBodySchema.safeParse({ provider: "fake", model: "m", mode: "x" }).success).toBe(
      false,
    );
  });
});

describe("RenameProjectBodySchema", () => {
  it("trims the name and rejects blank or overlong names", () => {
    expect(RenameProjectBodySchema.parse({ name: "  Index " }).name).toBe("Index");
    expect(RenameProjectBodySchema.safeParse({ name: "  " }).success).toBe(false);
    expect(RenameProjectBodySchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });
});

describe("ChapterStatusSchema", () => {
  it("includes submitted", () => {
    expect(ChapterStatusSchema.options).toContain("submitted");
  });
});
