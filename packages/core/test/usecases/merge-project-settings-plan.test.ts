import { describe, expect, it } from "vitest";
import { type MergeSourceVolume, planProjectSettings } from "../../src/index.ts";

function volume(
  bookId: string,
  volumeNumber: number | null,
  legacy: Partial<MergeSourceVolume["legacy"]>,
  createdAt = "2026-10-01T00:00:00.000Z",
): MergeSourceVolume {
  return {
    bookId,
    volumeNumber,
    createdAt,
    legacy: { customPrompt: "", glossary: [], ...legacy },
  };
}

describe("planProjectSettings", () => {
  it("unites the glossaries of every volume", () => {
    const plan = planProjectSettings([
      volume("v1", 1, { glossary: [{ source: "魔女", target: "witch" }] }),
      volume("v2", 2, { glossary: [{ source: "イレイナ", target: "Elaina", note: "heroine" }] }),
    ]);
    expect(plan.glossary).toEqual([
      { source: "魔女", target: "witch" },
      { source: "イレイナ", target: "Elaina", note: "heroine" },
    ]);
    expect(plan.glossaryConflicts).toEqual([]);
  });

  it("keeps the later volume's rendering in force and records the others as a conflict", () => {
    const plan = planProjectSettings([
      volume("v3", 3, { glossary: [{ source: "灰の魔女", target: "Ashen Witch" }] }),
      volume("v1", 1, { glossary: [{ source: "灰の魔女", target: "Witch of Ashes" }] }),
      volume("v2", 2, { glossary: [{ source: "灰の魔女", target: "Witch of Ashes" }] }),
    ]);
    expect(plan.glossary).toEqual([{ source: "灰の魔女", target: "Ashen Witch" }]);
    expect(plan.glossaryConflicts).toEqual([
      {
        source: "灰の魔女",
        inForce: { target: "Ashen Witch", bookId: "v3", volumeNumber: 3 },
        alternatives: [{ target: "Witch of Ashes", bookId: "v2", volumeNumber: 2 }],
      },
    ]);
  });

  it("does not count a different note on the same rendering as a conflict", () => {
    const plan = planProjectSettings([
      volume("v1", 1, { glossary: [{ source: " 杖 ", target: "staff", note: "weapon" }] }),
      volume("v2", 2, { glossary: [{ source: "杖", target: "staff" }] }),
    ]);
    expect(plan.glossary).toEqual([{ source: "杖", target: "staff" }]);
    expect(plan.glossaryConflicts).toEqual([]);
  });

  it("breaks a tie in volume number by import order", () => {
    const plan = planProjectSettings([
      volume("late", 2, { glossary: [{ source: "箒", target: "broom" }] }, "2026-10-05T00:00:00Z"),
      volume("early", 2, { glossary: [{ source: "箒", target: "besom" }] }, "2026-10-01T00:00:00Z"),
    ]);
    expect(plan.glossary).toEqual([{ source: "箒", target: "broom" }]);
    expect(plan.glossaryConflicts[0]?.alternatives).toEqual([
      { target: "besom", bookId: "early", volumeNumber: 2 },
    ]);
  });

  it("takes the custom prompt from the highest volume that has one", () => {
    const plan = planProjectSettings([
      volume("v1", 1, { customPrompt: "Keep honorifics." }),
      volume("v3", 3, { customPrompt: "  " }),
      volume("v2", 2, { customPrompt: "Use a light tone." }),
    ]);
    expect(plan.customPrompt).toBe("Use a light tone.");
  });

  it("yields an empty glossary and prompt when no volume has any", () => {
    expect(planProjectSettings([volume("v1", 1, {})])).toEqual({
      customPrompt: "",
      glossary: [],
      glossaryConflicts: [],
    });
  });
});
