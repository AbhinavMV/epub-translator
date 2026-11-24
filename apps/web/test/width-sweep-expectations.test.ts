// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  bandOf,
  type ExpectedFailure,
  formatVerdict,
  judge,
  type Observation,
} from "../e2e/width-sweep/expectations";

const heading = {
  kind: "overflows",
  path: 'header > h1 "EPUB Translator"',
  detail: "content 320px wide in a 300px box",
} as const;
const table = {
  kind: "overflows",
  path: 'main > div[data-slot="table-container"]',
  detail: "content 600px wide in a 343px box",
} as const;

const seen = (width: number, ...offenders: Observation["offenders"]): Observation => ({
  width,
  offenders: [...offenders],
});

describe("judge", () => {
  it("passes a clean screen with no expectations", () => {
    const verdict = judge("library", "light", [seen(320), seen(1280)], []);
    expect(verdict.ok).toBe(true);
  });

  it("flags an offender nobody expected, with its width", () => {
    const verdict = judge("library", "dark", [seen(320, heading), seen(1280)], []);
    expect(verdict.ok).toBe(false);
    expect(verdict.unexpected).toEqual([{ width: 320, offender: heading }]);
  });

  it("accepts an offender an entry covers in its band", () => {
    const expected: ExpectedFailure[] = [
      { screen: "library", offender: "h1", widths: [280, 639], review: "L1" },
    ];
    const verdict = judge("library", "light", [seen(320, heading), seen(1280)], expected);
    expect(verdict.ok).toBe(true);
  });

  it("still flags a different offender on a screen that already has an entry", () => {
    const expected: ExpectedFailure[] = [{ screen: "admin", offender: "h1", widths: [280, 639] }];
    const verdict = judge("admin", "light", [seen(320, heading, table)], expected);
    expect(verdict.unexpected).toEqual([{ width: 320, offender: table }]);
  });

  it("flags the offender when it appears outside the entry's band", () => {
    const expected: ExpectedFailure[] = [{ screen: "library", offender: "h1", widths: [280, 639] }];
    const verdict = judge("library", "light", [seen(320, heading), seen(1024, heading)], expected);
    expect(verdict.unexpected).toEqual([{ width: 1024, offender: heading }]);
  });

  it("fails when an expected failure no longer happens", () => {
    const expected: ExpectedFailure[] = [
      { screen: "library", offender: "h1", widths: [280, 639], review: "L1" },
    ];
    const verdict = judge("library", "light", [seen(320), seen(1280)], expected);
    expect(verdict.ok).toBe(false);
    expect(verdict.stale).toEqual(expected);
  });

  it("ignores entries for other screens and other themes", () => {
    const expected: ExpectedFailure[] = [
      { screen: "project", offender: "h1", widths: [280, 639] },
      { screen: "library", offender: "h1", widths: [280, 639], theme: "dark" },
    ];
    const verdict = judge("library", "light", [seen(320)], expected);
    expect(verdict.ok).toBe(true);
  });

  it("matches the offender text against kind and path", () => {
    const expected: ExpectedFailure[] = [
      {
        screen: "admin",
        offender: 'overflows: main > div[data-slot="table-container"]',
        widths: [280, 639],
      },
    ];
    const verdict = judge("admin", "light", [seen(375, table)], expected);
    expect(verdict.ok).toBe(true);
  });
});

describe("bandOf", () => {
  it("snaps widths to the phone, tablet and desktop bands", () => {
    expect(bandOf(280)).toEqual([280, 639]);
    expect(bandOf(639)).toEqual([280, 639]);
    expect(bandOf(640)).toEqual([640, 1023]);
    expect(bandOf(1024)).toEqual([1024, 1920]);
  });
});

describe("formatVerdict", () => {
  it("names the screen, theme, width and offender, and suggests an entry", () => {
    const verdict = judge("library", "dark", [seen(320, heading), seen(375, heading)], []);
    const text = formatVerdict(verdict);
    expect(text).toContain("library (dark)");
    expect(text).toContain('320px  overflows: header > h1 "EPUB Translator"');
    expect(text).toContain("content 320px wide in a 300px box");
    expect(text).toContain(
      '{ screen: "library", offender: "overflows: header > h1 \\"EPUB Translator\\"", widths: [280, 639] }',
    );
  });

  it("says which entries to remove", () => {
    const expected: ExpectedFailure[] = [
      { screen: "library", offender: "h1", widths: [280, 639], review: "L1" },
    ];
    const text = formatVerdict(judge("library", "light", [seen(320)], expected));
    expect(text).toContain("no longer happen");
    expect(text).toContain('offender: "h1"');
  });
});
