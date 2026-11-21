import type { PGlite } from "@electric-sql/pglite";
import type { ProjectSettings } from "@et/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStoreFactory, type Sql } from "../src/index.ts";
import { ALICE, BOB, createTestDatabase, resetData } from "./harness.ts";

let db: PGlite;
let sql: Sql;

beforeAll(async () => {
  ({ db, sql } = await createTestDatabase());
});
afterAll(() => db.close());
beforeEach(async () => {
  await resetData(db);
  await new PostgresStoreFactory(sql)
    .forOwner(ALICE)
    .projects.create({ id: "p1", name: "魔女の旅々", createdAt: "2026-10-01T00:00:00.000Z" });
});

const projects = (owner = ALICE) => new PostgresStoreFactory(sql).forOwner(owner).projects;

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

describe("project settings", () => {
  it("has none until saved, then returns the glossary, prompt and conflicts", async () => {
    expect(await projects().getSettings("p1")).toBeNull();
    await projects().putSettings("p1", settings);
    expect(await projects().getSettings("p1")).toEqual(settings);
    await projects().putSettings("p1", { ...settings, glossaryConflicts: [] });
    expect((await projects().getSettings("p1"))?.glossaryConflicts).toEqual([]);
  });

  it("go away with their project and are hidden from other owners", async () => {
    await projects().putSettings("p1", settings);
    expect(await projects(BOB).getSettings("p1")).toBeNull();
    await projects().delete("p1");
    expect(await projects().getSettings("p1")).toBeNull();
  });
});
