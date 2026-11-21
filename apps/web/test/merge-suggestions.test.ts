import { describe, expect, it } from "vitest";
import { mergeSuggestions } from "@/lib/merge-suggestions";

describe("mergeSuggestions", () => {
  it("appends new sources and keeps the earliest rendering of a repeated source", () => {
    const first = [
      { source: "シャル", target: "Charlotte" },
      { source: "魔王", target: "Demon King" },
    ];
    const merged = mergeSuggestions(first, [
      { source: " 魔王 ", target: "Overlord" },
      { source: "勇者", target: "Hero", note: "title" },
    ]);
    expect(merged).toEqual([
      { source: "シャル", target: "Charlotte" },
      { source: "魔王", target: "Demon King" },
      { source: "勇者", target: "Hero", note: "title" },
    ]);
  });

  it("does not cap the merged list", () => {
    const batch = (from: number) =>
      Array.from({ length: 60 }, (_, i) => ({ source: `s${from + i}`, target: "t" }));
    expect(mergeSuggestions(batch(0), batch(60))).toHaveLength(120);
  });
});
