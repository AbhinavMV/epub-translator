import type { ProjectSettings } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase, SqliteProjectRepository } from "../src/index.ts";

const settings: ProjectSettings = {
  customPrompt: "Keep honorifics",
  glossary: [{ source: "灰の魔女", target: "Ashen Witch", note: "title" }],
  glossaryConflicts: [
    {
      source: "灰の魔女",
      inForce: { target: "Ashen Witch", note: "title", bookId: "b2", volumeNumber: 2 },
      alternatives: [{ target: "Witch of Ashes", bookId: "b1", volumeNumber: 1 }],
    },
  ],
};

let db: Database;
let projects: SqliteProjectRepository;
beforeEach(async () => {
  db = openDatabase(":memory:");
  projects = new SqliteProjectRepository(db);
  await projects.create({ id: "p1", name: "魔女の旅々", createdAt: "2026-10-01T00:00:00.000Z" });
});

describe("project settings", () => {
  it("has none until saved, then returns the glossary, prompt and conflicts", async () => {
    expect(await projects.getSettings("p1")).toBeNull();
    await projects.putSettings("p1", settings);
    expect(await projects.getSettings("p1")).toEqual(settings);
    await projects.putSettings("p1", { ...settings, glossaryConflicts: [] });
    expect((await projects.getSettings("p1"))?.glossaryConflicts).toEqual([]);
  });

  it("go away with their project", async () => {
    await projects.putSettings("p1", settings);
    await projects.delete("p1");
    expect(await projects.getSettings("p1")).toBeNull();
  });
});
