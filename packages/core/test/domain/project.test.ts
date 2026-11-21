import { describe, expect, it } from "vitest";
import { unnumberedVolumeNumber } from "../../src/domain/project.ts";

describe("unnumberedVolumeNumber", () => {
  it.each<[string, (number | null)[], number]>([
    ["an empty project", [], 1],
    ["a project without volume 1", [2, 3], 1],
    ["a project whose books have no volume number", [null], 1],
    ["a project with volume 1", [1], 2],
    ["the next number after the highest", [3, 1, 2], 4],
    ["a fractional highest volume", [1, 2.5], 3],
    ["shared volume numbers", [1, 1], 2],
  ])("gives %s the right number", (_case, existing, expected) => {
    expect(unnumberedVolumeNumber(existing)).toBe(expected);
  });
});
