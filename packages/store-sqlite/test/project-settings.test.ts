import type { ProjectSettings } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Database,
  openDatabase,
  SqliteProjectRepository,
  SqliteProjectSettingsRepository,
} from "../src/index.ts";

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
let projectSettings: SqliteProjectSettingsRepository;
beforeEach(async () => {
  db = openDatabase(":memory:");
  projects = new SqliteProjectRepository(db);
  projectSettings = new SqliteProjectSettingsRepository(db);
  await projects.create({ id: "p1", name: "魔女の旅々", createdAt: "2026-10-01T00:00:00.000Z" });
});

describe("project settings", () => {
  it("has none until saved, then returns the glossary, prompt and conflicts", async () => {
    expect(await projectSettings.get("p1")).toBeNull();
    await projectSettings.put("p1", settings);
    expect(await projectSettings.get("p1")).toEqual(settings);
    await projectSettings.put("p1", { ...settings, glossaryConflicts: [] });
    expect((await projectSettings.get("p1"))?.glossaryConflicts).toEqual([]);
  });

  it("go away with their project", async () => {
    await projectSettings.put("p1", settings);
    await projects.delete("p1");
    expect(await projectSettings.get("p1")).toBeNull();
  });
});
