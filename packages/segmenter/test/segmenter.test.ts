import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import {
  decodeInto,
  encodeBlock,
  findSegmentBlocks,
  PlaceholderMismatchError,
  plainTextInto,
} from "../src/index.ts";

const NS = "http://www.w3.org/1999/xhtml";

function body(inner: string): Element {
  const doc = new DOMParser().parseFromString(
    `<html xmlns="${NS}"><body>${inner}</body></html>`,
    "application/xhtml+xml",
  );
  return doc.getElementsByTagName("body")[0] as unknown as Element;
}

function xml(node: Node): string {
  return new XMLSerializer().serializeToString(node as never).replaceAll(` xmlns="${NS}"`, "");
}

function firstBlock(inner: string): Element {
  const block = findSegmentBlocks(body(inner))[0];
  if (!block) throw new Error("no block");
  return block;
}

describe("findSegmentBlocks", () => {
  it("finds leaf p and h1 but skips empty <p><br/></p>", () => {
    const blocks = findSegmentBlocks(body("<h1>Title</h1><p><br/></p><p>Hello</p><p>　</p>"));
    expect(blocks.map((b) => b.localName)).toEqual(["h1", "p"]);
  });

  it("skips image-only paragraphs", () => {
    expect(findSegmentBlocks(body('<p><img src="a.png"/></p>'))).toEqual([]);
  });

  it("returns only leaf blocks of nested containers in document order", () => {
    const blocks = findSegmentBlocks(
      body("<div><p>one</p><div><p>two</p></div></div><blockquote><p>three</p></blockquote>"),
    );
    expect(blocks.map((b) => b.textContent)).toEqual(["one", "two", "three"]);
  });
});

describe("encodeBlock", () => {
  it("unwraps ruby to base text", () => {
    const enc = encodeBlock(firstBlock("<p>頭を<ruby>撫<rt>な</rt></ruby>でて</p>"));
    expect(enc.text).toBe("頭を撫でて");
  });

  it("encodes span.tcy as paired token", () => {
    const enc = encodeBlock(firstBlock('<p>あっ<span class="tcy">!?</span></p>'));
    expect(enc.text).toBe("あっ<1>!?</1>");
    expect(enc.inline).toHaveLength(1);
  });

  it("encodes br and img as atomic tokens", () => {
    const enc = encodeBlock(firstBlock('<p>a<br/>b<img src="x.png"/></p>'));
    expect(enc.text).toBe("a<x1/>b<x2/>");
  });

  it("keeps a lone full-width space between inline elements", () => {
    const enc = encodeBlock(firstBlock("<p><b>a</b>　<i>b</i></p>"));
    expect(enc.text).toBe("<1>a</1>　<2>b</2>");
  });

  it("escapes markup characters in text", () => {
    expect(encodeBlock(firstBlock("<p>a &lt; b &amp; c</p>")).text).toBe("a &lt; b &amp; c");
  });

  it("numbers nested tokens in document order", () => {
    const enc = encodeBlock(firstBlock("<p><em>a<strong>b</strong></em><sup>1</sup></p>"));
    expect(enc.text).toBe("<1>a<2>b</2></1><x3/>");
  });
});

describe("decodeInto", () => {
  const samples = [
    '<p>あっ<span class="tcy">!?</span>と</p>',
    '<p>a<br/>b <em class="x">c<a href="u">d</a></em><img src="i.png"/></p>',
    "<p>a &amp; b &lt; c</p>",
  ];

  it.each(samples)("round-trips identity translation to identical XML: %s", (sample) => {
    const block = firstBlock(sample);
    const enc = encodeBlock(block);
    decodeInto(block, enc.text, enc.inline);
    expect(xml(block)).toBe(sample);
  });

  it("drops ruby readings when decoding the identity translation", () => {
    const block = firstBlock("<p>頭を<ruby>撫<rt>な</rt></ruby>でて</p>");
    const enc = encodeBlock(block);
    decodeInto(block, enc.text, enc.inline);
    expect(xml(block)).toBe("<p>頭を撫でて</p>");
  });

  it("lets tokens move", () => {
    const block = firstBlock('<p>was <span class="a" id="s">it</span></p>');
    const enc = encodeBlock(block);
    decodeInto(block, "<1>it</1> was", enc.inline);
    expect(xml(block)).toBe('<p><span class="a" id="s">it</span> was</p>');
  });

  it("throws PlaceholderMismatchError for a dropped token", () => {
    const block = firstBlock("<p>a<span>b</span></p>");
    const enc = encodeBlock(block);
    expect(() => decodeInto(block, "ab", enc.inline)).toThrow(PlaceholderMismatchError);
  });

  it("throws PlaceholderMismatchError for duplicated, unknown and badly nested tokens", () => {
    const block = firstBlock("<p><em>a</em><strong>b</strong><br/></p>");
    const enc = encodeBlock(block);
    for (const bad of [
      "<1>a</1><1>a</1><2>b</2><x3/>",
      "<1>a</1><2>b</2><x3/><x4/>",
      "<1>a<2>b</1></2><x3/>",
      "<1>a</1><2>b</2><x3/></2>",
      "<1>a</1><2>b<x3/>",
      "<1>a</1><x2/><x3/>",
    ]) {
      expect(() => decodeInto(block, bad, enc.inline)).toThrow(PlaceholderMismatchError);
    }
  });

  it("leaves the block untouched when decoding fails", () => {
    const block = firstBlock("<p>a<span>b</span></p>");
    const enc = encodeBlock(block);
    expect(() => decodeInto(block, "<1>x", enc.inline)).toThrow();
    expect(xml(block)).toBe("<p>a<span>b</span></p>");
  });
});

describe("plainTextInto", () => {
  it("keeps atomic nodes and drops paired markup", () => {
    const block = firstBlock('<p>a<span class="t">b</span><img src="i.png"/></p>');
    const enc = encodeBlock(block);
    plainTextInto(block, "A<1>B</1>", enc.inline);
    expect(xml(block)).toBe('<p>AB<img src="i.png"/></p>');
  });

  it("keeps atomic nodes in place when the translation positions them", () => {
    const block = firstBlock("<p>a<br/>b</p>");
    const enc = encodeBlock(block);
    plainTextInto(block, "A<x1/>B", enc.inline);
    expect(xml(block)).toBe("<p>A<br/>B</p>");
  });
});
