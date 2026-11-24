import {
  type BookSummary,
  ChapterViewSchema,
  JobSummarySchema,
  ProjectDetailSchema,
  type ProjectSettings,
  ProjectSettingsSchema,
  ProjectSummarySchema,
} from "@et/contracts";
import { describe, expect, it } from "vitest";
import type { Api } from "@/api/client";
import { createMockApi } from "@/api/mock";

async function seeded(api: Api = createMockApi()) {
  const summaries = ProjectSummarySchema.array().parse(await api.listProjects());
  const details = await Promise.all(
    summaries.map(async (s) => ProjectDetailSchema.parse(await api.getProject(s.id))),
  );
  return { summaries, details };
}

async function translatedSegments(api: Api, book: BookSummary, lang = "en") {
  const job = JobSummarySchema.parse(await api.getWorkspace(book.id, lang));
  return job.progress.reduce((n, p) => n + p.done, 0);
}

describe("seeded mock API", () => {
  it("has several projects, one with a very long name and very long volume titles", async () => {
    const { summaries, details } = await seeded();
    expect(summaries.length).toBeGreaterThanOrEqual(4);
    const long = details.find((p) => p.name.length > 60);
    expect(long).toBeDefined();
    const titles = long?.books.map((b) => b.title) ?? [];
    expect(titles.some((t) => t.length > 80)).toBe(true);
    expect(titles.some((t) => t.split(/\s+/).some((word) => word.length >= 30))).toBe(true);
  });

  it("has a project fully translated into a language other than English", async () => {
    const { summaries } = await seeded();
    const langs = summaries.map((s) => s.fullyTranslatedLang);
    expect(langs.some((lang) => lang !== null && lang !== "en")).toBe(true);
  });

  it("has a partly translated, a not-started and a one-volume project", async () => {
    const api = createMockApi();
    const { details } = await seeded(api);
    const partly = details.find(
      (p) => p.fullyTranslatedLang === null && p.books.some((b) => b.translatedLang),
    );
    expect(partly).toBeDefined();
    const notStarted = [];
    for (const p of details) {
      if (p.books.length === 0) continue;
      const counts = await Promise.all(p.books.map((b) => translatedSegments(api, b)));
      if (counts.every((n) => n === 0)) notStarted.push(p);
    }
    expect(notStarted.length).toBeGreaterThan(0);
    expect(details.some((p) => p.books.length === 1)).toBe(true);
  });

  it("has a multi-volume project with fractional numbers and mixed volume progress", async () => {
    const api = createMockApi();
    const { details } = await seeded(api);
    const multi = details.find((p) =>
      p.books.some((b) => b.volumeNumber != null && !Number.isInteger(b.volumeNumber)),
    );
    expect(multi).toBeDefined();
    const books = multi?.books ?? [];
    const counts = await Promise.all(books.map((b) => translatedSegments(api, b)));
    const states = books.map((b, i) =>
      b.translatedLang ? "translated" : (counts[i] ?? 0) > 0 ? "partly" : "untranslated",
    );
    expect(new Set(states)).toEqual(new Set(["translated", "partly", "untranslated"]));
  });

  it("has a project with an empty glossary and one with a glossary conflict", async () => {
    const api = createMockApi();
    const { details } = await seeded(api);
    const settings: ProjectSettings[] = await Promise.all(
      details.map(async (p) => ProjectSettingsSchema.parse(await api.getProjectSettings(p.id))),
    );
    expect(settings.some((s) => s.glossary.length === 0)).toBe(true);
    const withConflict = settings.find((s) => s.glossaryConflicts.length > 0);
    const conflict = withConflict?.glossaryConflicts[0];
    expect(withConflict?.glossary.map((e) => e.source)).toContain(conflict?.source);
    const owner = details[settings.indexOf(withConflict as ProjectSettings)];
    const ids = owner?.books.map((b) => b.id) ?? [];
    expect(ids).toContain(conflict?.inForce.bookId);
    expect(ids).toContain(conflict?.alternatives[0]?.bookId);
  });

  it("has a chapter with failed passages that carry their reason", async () => {
    const api = createMockApi();
    const { details } = await seeded(api);
    const books = details.flatMap((p) => p.books);
    let found = false;
    for (const book of books) {
      const job = JobSummarySchema.parse(await api.getWorkspace(book.id, "en"));
      const failing = job.progress.find((p) => p.failed > 0);
      if (!failing) continue;
      const view = ChapterViewSchema.parse(
        await api.getChapter(book.id, failing.chapterId, job.id, 0),
      );
      const failed = view.blocks.filter((b) => b.kind === "segment" && b.status === "failed");
      expect(failed).toHaveLength(failing.failed);
      expect(failed.every((b) => b.kind === "segment" && b.note && b.targetHtml === null)).toBe(
        true,
      );
      found = true;
    }
    expect(found).toBe(true);
  });

  it("has a chapter with pending proofread suggestions that can be accepted", async () => {
    const api = createMockApi();
    const { details } = await seeded(api);
    let accepted = 0;
    for (const book of details.flatMap((p) => p.books)) {
      const job = await api.getWorkspace(book.id, "en");
      const pending = (await api.listProofreads(job.id)).find((p) => p.pending > 0);
      if (!pending) continue;
      const proofread = await api.getProofread(job.id, pending.chapterId);
      const ids = proofread?.suggestions.map((s) => s.segmentId) ?? [];
      const decided = await api.decideProofread(job.id, pending.chapterId, { accept: ids });
      accepted += decided.suggestions.filter((s) => s.state === "accepted").length;
    }
    expect(accepted).toBeGreaterThan(0);
  });
});
