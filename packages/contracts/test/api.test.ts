import { describe, expect, it } from "vitest";
import {
  BookSummarySchema,
  ChapterStatusSchema,
  ImportPlacementSchema,
  ProjectDetailSchema,
  ProjectSummarySchema,
  RenameProjectBodySchema,
  TranslateBodySchema,
} from "../src/index.ts";

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

describe("ImportPlacementSchema", () => {
  it("takes either an existing project or a new project name, never both", () => {
    expect(ImportPlacementSchema.parse({ projectId: "p1", volumeNumber: 2.5 })).toEqual({
      projectId: "p1",
      volumeNumber: 2.5,
    });
    expect(ImportPlacementSchema.parse({ projectName: " New ", volumeNumber: null })).toEqual({
      projectName: "New",
      volumeNumber: null,
    });
    const bad = [
      { projectId: "p1", projectName: "x", volumeNumber: 1 },
      { projectName: "  ", volumeNumber: 1 },
      { projectId: "p1", volumeNumber: -1 },
      { volumeNumber: 1 },
    ];
    for (const body of bad) expect(ImportPlacementSchema.safeParse(body).success).toBe(false);
  });
});

describe("ChapterStatusSchema", () => {
  it("includes submitted", () => {
    expect(ChapterStatusSchema.options).toContain("submitted");
  });
});

describe("project schemas", () => {
  const project = { id: "p1", name: "本", createdAt: "2026-10-23T00:00:00.000Z" };

  it("require fullyTranslatedLang, null when no language is complete", () => {
    const summary = { ...project, volumeCount: 1, coverUrl: null, mainLang: null };
    const counted = { ...summary, translatedVolumeCount: 0 };
    expect(ProjectSummarySchema.safeParse(counted).success).toBe(false);
    expect(ProjectSummarySchema.parse({ ...counted, fullyTranslatedLang: null })).toMatchObject({
      fullyTranslatedLang: null,
    });
    const detail = { ...project, books: [], mainLang: "fr" };
    expect(ProjectDetailSchema.safeParse(detail).success).toBe(false);
    expect(ProjectDetailSchema.parse({ ...detail, fullyTranslatedLang: "fr" })).toMatchObject({
      fullyTranslatedLang: "fr",
    });
  });

  it("require the main language and translated volume count", () => {
    const summary = { ...project, volumeCount: 2, coverUrl: null, fullyTranslatedLang: null };
    expect(ProjectSummarySchema.safeParse({ ...summary, mainLang: "fr" }).success).toBe(false);
    expect(ProjectSummarySchema.safeParse({ ...summary, translatedVolumeCount: 1 }).success).toBe(
      false,
    );
    expect(
      ProjectSummarySchema.parse({ ...summary, mainLang: "fr", translatedVolumeCount: 1 }),
    ).toMatchObject({ mainLang: "fr", translatedVolumeCount: 1 });
    const detail = { ...project, books: [], fullyTranslatedLang: null };
    expect(ProjectDetailSchema.safeParse(detail).success).toBe(false);
    expect(ProjectDetailSchema.parse({ ...detail, mainLang: null })).toMatchObject({
      mainLang: null,
    });
  });

  it("let a book summary carry its translated percentage", () => {
    const book = {
      id: "b1",
      title: "本",
      author: null,
      sourceLang: "ja",
      coverUrl: null,
      chapterCount: 1,
      segmentCount: 3,
      createdAt: project.createdAt,
    };
    expect(BookSummarySchema.parse(book).translatedPercent).toBeUndefined();
    expect(BookSummarySchema.parse({ ...book, translatedPercent: 66 }).translatedPercent).toBe(66);
    expect(BookSummarySchema.parse({ ...book, translatedPercent: null }).translatedPercent).toBe(
      null,
    );
  });
});
