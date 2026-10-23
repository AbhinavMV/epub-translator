import { describe, expect, it } from "vitest";
import { stripTokens, validateTokens } from "../src/translation/placeholders.ts";

describe("validateTokens", () => {
  it("accepts identical tokens around different words", () => {
    expect(validateTokens("<1>こんにちは</1>世界<x2/>", "<1>Hello</1> world<x2/>")).toBeNull();
  });

  it("accepts plain text without tokens", () => {
    expect(validateTokens("やあ", "Hi")).toBeNull();
  });

  it("accepts reordered paired tokens as long as nesting is valid", () => {
    expect(validateTokens("<1>a</1><2>b</2>", "<2>b</2><1>a</1>")).toBeNull();
  });

  it("reports a missing closing token", () => {
    expect(validateTokens("<1>a</1>", "<1>a")).toMatch(/missing.*<\/1>/);
  });

  it("reports a missing atomic token", () => {
    expect(validateTokens("a<x3/>b", "ab")).toMatch(/missing.*<x3\/>/);
  });

  it("reports an extra token that is not in the source", () => {
    expect(validateTokens("a", "<4>a</4>")).toMatch(/extra/i);
  });

  it("reports a duplicated token", () => {
    expect(validateTokens("a<x1/>", "a<x1/><x1/>")).toMatch(/duplicat/i);
  });

  it("reports badly nested pairs", () => {
    expect(validateTokens("<1>a<2>b</2></1>", "<1>a<2>b</1></2>")).toMatch(/nest/i);
  });

  it("reports a closing token before its opening token", () => {
    expect(validateTokens("<1>a</1>", "</1>a<1>")).toMatch(/nest/i);
  });

  it("ignores angle brackets that are not tokens", () => {
    expect(validateTokens("1 < 2", "1 < 2")).toBeNull();
  });
});

describe("stripTokens", () => {
  it("removes paired and atomic tokens and keeps the words", () => {
    expect(stripTokens("<1>Hello</1> big<x2/> world")).toBe("Hello big world");
  });
});
