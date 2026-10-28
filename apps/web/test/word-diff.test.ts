import { describe, expect, it } from "vitest";
import { wordDiff } from "@/lib/word-diff";

describe("wordDiff", () => {
  it("marks a replaced word and keeps the rest", () => {
    expect(wordDiff("He was angry.", "He was sulking.")).toEqual([
      { kind: "same", text: "He was " },
      { kind: "removed", text: "angry" },
      { kind: "added", text: "sulking" },
      { kind: "same", text: "." },
    ]);
  });

  it("diffs CJK text by character", () => {
    expect(wordDiff("彼は怒った", "彼は拗ねた")).toEqual([
      { kind: "same", text: "彼は" },
      { kind: "removed", text: "怒っ" },
      { kind: "added", text: "拗ね" },
      { kind: "same", text: "た" },
    ]);
  });

  it("returns a single same part for identical text", () => {
    expect(wordDiff("Same text", "Same text")).toEqual([{ kind: "same", text: "Same text" }]);
  });
});
