import type { ChapterView, JobSummary } from "@et/contracts";

export function makeJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: "job1",
    bookId: "book1",
    targetLang: "en",
    status: "idle",
    error: null,
    progress: [
      { chapterId: "c1", status: "idle", done: 0, flagged: 0, failed: 0, total: 4, error: null },
      { chapterId: "c2", status: "idle", done: 0, flagged: 0, failed: 0, total: 2, error: null },
    ],
    titles: { book: null, chapters: {} },
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: "2026-10-23T00:00:00.000Z",
    ...overrides,
  };
}

export function makeChapter(): ChapterView {
  return {
    chapterId: "c1",
    index: 0,
    title: "Chapter One",
    prevChapterId: null,
    nextChapterId: "c2",
    blocks: [
      {
        kind: "segment",
        id: "s1",
        sourceHtml: "<p>原文一</p>",
        targetHtml: "<p>Target one</p>",
        status: "done",
      },
      { kind: "static", html: '<img src="/api/books/book1/assets/a.png" alt="fig">' },
      {
        kind: "segment",
        id: "s2",
        sourceHtml: "<p>原文二</p>",
        targetHtml: null,
        status: "pending",
      },
      {
        kind: "segment",
        id: "s3",
        sourceHtml: "<p>原文三</p>",
        targetHtml: "<p>Target three</p>",
        status: "flagged",
      },
    ],
  };
}
