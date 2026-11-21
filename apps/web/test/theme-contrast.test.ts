// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

function tokensIn(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in styles.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const [, name = "", value = ""] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const light = tokensIn(":root");
const themes = {
  light,
  sepia: { ...light, ...tokensIn('[data-theme="sepia"]') },
  dark: { ...light, ...tokensIn('[data-theme="dark"]') },
};

function rgb(hex: string | undefined): [number, number, number] {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}

function luminance(hex: string | undefined): number {
  const [r, g, b] = rgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string | undefined, b: string | undefined): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hue(hex: string | undefined): number {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const TEXT = 4.5;
const UI = 3;
const pairs: [fg: string, bg: string, min: number][] = [
  ["foreground", "background", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["primary", "background", TEXT],
  ["primary", "card", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["primary-foreground", "primary-hover", TEXT],
  ["cover-fallback-foreground", "cover-fallback", TEXT],
  ["rail-active-foreground", "rail-active", TEXT],
  ["destructive", "background", TEXT],
  ["destructive", "card", TEXT],
  ["ring", "background", UI],
  ["ring", "card", UI],
  ["flag", "background", UI],
];

describe.each(Object.entries(themes))("%s theme", (_name, tokens) => {
  it.each(pairs)("%s on %s meets %d:1", (fg, bg, min) => {
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it("uses a blue primary and ring", () => {
    for (const token of ["primary", "ring"]) {
      expect(hue(tokens[token])).toBeGreaterThan(205);
      expect(hue(tokens[token])).toBeLessThan(230);
    }
  });

  it("keeps flag and destructive hues apart from the primary", () => {
    const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    expect(apart(hue(tokens.flag), hue(tokens.primary))).toBeGreaterThan(90);
    expect(apart(hue(tokens.destructive), hue(tokens.primary))).toBeGreaterThan(90);
  });
});

describe("component colour classes", () => {
  const srcDir = fileURLToPath(new URL("../src", import.meta.url));
  const sources = readdirSync(srcDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => ({ file, text: readFileSync(join(srcDir, file), "utf8") }));
  const offenders = (pattern: RegExp) =>
    sources.filter(({ text }) => pattern.test(text)).map(({ file }) => file);

  it("draws focus rings at full strength so they keep 3:1", () => {
    expect(offenders(/focus-visible:ring-(ring|destructive)\/\d+/)).toEqual([]);
  });

  it("darkens primary on hover with a token instead of fading it", () => {
    expect(offenders(/bg-primary\/90/)).toEqual([]);
  });

  it("sets cover placeholder text on the cover token, not primary on a primary tint", () => {
    expect(offenders(/from-primary\/\d+[^"]*text-primary\b/)).toEqual([]);
  });

  it("keeps proofreading kind badges off the primary blue", () => {
    const review = sources.find(({ file }) => file.endsWith("proofread-review.tsx"));
    expect(review?.text).toBeDefined();
    expect(review?.text).not.toMatch(/\b(sky|blue|cyan|indigo)-\d/);
  });
});

it("computes WCAG contrast like the reference values", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#2f6fde", "#ffffff")).toBeCloseTo(4.72, 2);
});
