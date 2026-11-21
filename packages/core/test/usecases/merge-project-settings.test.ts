import { describe, expect, it } from "vitest";
import { describeMergePlan, mergeProjectSettings, type StoredBook } from "../../src/index.ts";
import {
  MemoryBooks,
  MemoryProjectSettings,
  MemoryProjects,
  MemorySettings,
  sampleParsed,
} from "./fakes.ts";

function book(id: string, projectId: string | null, volumeNumber: number | null): StoredBook {
  return {
    id,
    sha256: id,
    title: `Book ${id}`,
    author: null,
    sourceLang: "ja",
    coverHref: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    projectId,
    volumeNumber,
  };
}

async function library({ loose = false } = {}) {
  const deps = {
    books: new MemoryBooks(),
    projects: new MemoryProjects(),
    projectSettings: new MemoryProjectSettings(),
    settings: new MemorySettings(),
  };
  await deps.projects.create({ id: "p", name: "魔女の旅々", createdAt: "2026-10-01T00:00:00Z" });
  await deps.books.insert(book("v1", "p", 1), sampleParsed);
  await deps.books.insert(book("v2", "p", 2), sampleParsed);
  if (loose) deps.books.seedUnplaced(book("loose", null, null), sampleParsed);
  deps.settings.legacy.set("v1", {
    customPrompt: "Keep honorifics.",
    glossary: [{ source: "灰の魔女", target: "Witch of Ashes" }],
  });
  deps.settings.legacy.set("v2", {
    customPrompt: "",
    glossary: [{ source: "灰の魔女", target: "Ashen Witch" }],
  });
  return deps;
}

const merged = {
  customPrompt: "Keep honorifics.",
  glossary: [{ source: "灰の魔女", target: "Ashen Witch" }],
  glossaryConflicts: [
    {
      source: "灰の魔女",
      inForce: { target: "Ashen Witch", bookId: "v2", volumeNumber: 2 },
      alternatives: [{ target: "Witch of Ashes", bookId: "v1", volumeNumber: 1 }],
    },
  ],
};

describe("mergeProjectSettings", () => {
  it("dry run lists the merged glossary and conflicts without writing", async () => {
    const deps = await library({ loose: true });
    const plan = await mergeProjectSettings(deps, { apply: false });
    expect(plan).toEqual({
      projects: [{ projectId: "p", name: "魔女の旅々", status: "merge", settings: merged }],
      unplaced: [{ bookId: "loose", title: "Book loose" }],
    });
    expect(await deps.projectSettings.get("p")).toBeNull();
    expect(describeMergePlan(plan).join("\n")).toContain("Witch of Ashes (vol 1)");
  });

  it("apply writes the project settings and leaves the books' own terms in place", async () => {
    const deps = await library();
    await mergeProjectSettings(deps, { apply: true });
    expect(await deps.projectSettings.get("p")).toEqual(merged);
    expect(await deps.settings.getLegacyTerms("v1")).toEqual({
      customPrompt: "Keep honorifics.",
      glossary: [{ source: "灰の魔女", target: "Witch of Ashes" }],
    });
  });

  it("apply writes nothing while some books have no project yet", async () => {
    const deps = await library({ loose: true });
    const plan = await mergeProjectSettings(deps, { apply: true });
    expect(await deps.projectSettings.get("p")).toBeNull();
    expect(describeMergePlan(plan).join("\n")).toContain("run backfill:projects first");
  });

  it("does not write a merged glossary over 2,000 entries", async () => {
    const deps = await library();
    deps.settings.legacy.set("v1", {
      customPrompt: "",
      glossary: Array.from({ length: 2001 }, (_, i) => ({ source: `語${i}`, target: `t${i}` })),
    });
    const plan = await mergeProjectSettings(deps, { apply: true });
    expect(plan.projects[0]?.status).toBe("too-large");
    expect(await deps.projectSettings.get("p")).toBeNull();
    expect(describeMergePlan(plan)[0]).toContain("2002 entries exceed the 2000-entry limit");
  });

  it("a re-run skips projects that already have settings, keeping later edits", async () => {
    const deps = await library();
    await mergeProjectSettings(deps, { apply: true });
    const edited = { ...merged, glossary: [{ source: "灰の魔女", target: "Grey Witch" }] };
    await deps.projectSettings.put("p", edited);

    const again = await mergeProjectSettings(deps, { apply: true });
    expect(again.projects).toEqual([{ projectId: "p", name: "魔女の旅々", status: "skip" }]);
    expect(await deps.projectSettings.get("p")).toEqual(edited);
  });
});
