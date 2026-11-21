import { describe, expect, it } from "vitest";
import {
  ChapterStatusSchema,
  ImportPlacementSchema,
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
