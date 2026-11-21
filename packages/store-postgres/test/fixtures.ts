import type { Job, ParsedBook, Project, ProviderBatch, Repositories, StoredBook } from "@et/core";

export const project: Project = {
  id: "p1",
  name: "本",
  createdAt: "2026-10-23T00:00:00.000Z",
};

export const book: StoredBook = {
  id: "b1",
  sha256: "abc",
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  createdAt: "2026-10-23T00:00:00.000Z",
  projectId: "p1",
  volumeNumber: 1,
};

export async function insertBook(
  repos: Pick<Repositories, "books" | "projects">,
  stored: StoredBook = book,
): Promise<void> {
  const projectId = stored.projectId ?? project.id;
  if (!(await repos.projects.get(projectId)))
    await repos.projects.create({ ...project, id: projectId });
  await repos.books.insert(stored, parsed);
}

export const parsed: ParsedBook = {
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  chapters: [{ id: "ch-0", index: 0, title: "第一章", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "こんにちは" }],
};

export const job: Job = {
  id: "j1",
  bookId: "b1",
  targetLang: "en",
  sourceLang: "ja",
  error: null,
  usage: { inputTokens: 0, outputTokens: 0 },
  createdAt: "2026-10-23T00:00:00.000Z",
};

export const batch = (over: Partial<ProviderBatch> = {}): ProviderBatch => ({
  id: "pb1",
  jobId: "j1",
  chapterId: "ch-0",
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  vendorBatchId: "msgbatch_1",
  status: "submitted",
  segmentIds: [["a.xhtml#0"], ["a.xhtml#1", "a.xhtml#2"]],
  createdAt: "2026-10-23T00:00:00.000Z",
  ...over,
});
