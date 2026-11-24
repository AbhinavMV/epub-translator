import type { ChapterProgress } from "@et/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChapterStatusIcon } from "@/components/chapter-status-icon";
import { chapterStatus } from "@/lib/chapter-status";

const progress = (p: Partial<ChapterProgress>): ChapterProgress => ({
  chapterId: "c1",
  status: "idle",
  done: 0,
  flagged: 0,
  failed: 0,
  total: 10,
  error: null,
  ...p,
});

describe("chapterStatus", () => {
  it.each([
    ["no job yet", undefined, "not-started", "Not started", "10 passages"],
    ["nothing translated", progress({}), "not-started", "Not started", "10 passages"],
    [
      "some passages done",
      progress({ status: "partial", done: 3 }),
      "partial",
      "Partly translated",
      "3/10 passages",
    ],
    [
      "flagged passages count as translated",
      progress({ status: "partial", done: 8, flagged: 2 }),
      "done",
      "Translated",
      "Translated",
    ],
    [
      "failed passages",
      progress({ status: "partial", done: 6, failed: 2 }),
      "failed",
      "Has failed passages",
      "6/10 · 2 failed",
    ],
    [
      "a chapter error with no failed passage",
      progress({ status: "failed", done: 4, error: "rate limited" }),
      "failed",
      "Failed",
      "4/10 passages",
    ],
    [
      "translating",
      progress({ status: "running", done: 4 }),
      "busy",
      "Translating",
      "4/10 passages",
    ],
    ["queued", progress({ status: "queued" }), "busy", "Queued", "0/10 passages"],
    [
      "a chapter with no passages",
      progress({ status: "done", total: 0 }),
      "done",
      "Translated",
      "Translated",
    ],
  ] as const)("%s", (_, p, state, label, detail) => {
    const s = chapterStatus(p, 10);
    expect(s.state).toBe(state);
    expect(s.label).toBe(label);
    expect(s.detail).toBe(detail);
  });

  it("never counts more translated passages than the chapter has", () => {
    const s = chapterStatus(progress({ done: 10, flagged: 2, status: "partial" }), 10);
    expect(s.translated).toBe(10);
    expect(s.ratio).toBe(1);
  });

  it("reports the share translated", () => {
    expect(chapterStatus(progress({ done: 5, status: "partial" }), 10).ratio).toBe(0.5);
    expect(chapterStatus(undefined, 0).ratio).toBe(0);
  });
});

describe("ChapterStatusIcon", () => {
  it("names the state for screen readers", () => {
    render(<ChapterStatusIcon status={chapterStatus(progress({ done: 6, failed: 2 }), 10)} />);
    expect(screen.getByRole("img", { name: "Has failed passages" })).toBeInTheDocument();
  });
});
