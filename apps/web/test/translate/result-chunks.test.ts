import type { ResultSegment } from "@et/contracts";
import { describe, expect, it } from "vitest";
import { chunkSegments } from "@/translate/result-chunks";

const seg = (id: string, chars = 1): ResultSegment => ({
  id,
  text: "x".repeat(chars),
  status: "done",
});
const bytes = (chunk: ResultSegment[]) => new TextEncoder().encode(JSON.stringify(chunk)).length;

describe("chunkSegments", () => {
  it("returns one empty chunk when there is nothing to send", () => {
    expect(chunkSegments([])).toEqual([[]]);
  });

  it("caps a chunk at 500 segments", () => {
    const chunks = chunkSegments(Array.from({ length: 1001 }, (_, i) => seg(`s${i}`)));
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 1]);
  });

  it("caps a chunk at 2 MB and keeps order", () => {
    const all = Array.from({ length: 10 }, (_, i) => seg(`s${i}`, 700_000));
    const chunks = chunkSegments(all);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(2_000_000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(all);
  });

  it("never drops a single segment larger than the budget", () => {
    const chunks = chunkSegments([seg("a", 10), seg("b", 3_000_000), seg("c", 10)]);
    expect(chunks.flat().map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});
