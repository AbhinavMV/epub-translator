import { InvalidEpubError } from "@et/core";
import { describe, expect, it } from "vitest";
import { YauzlEpubParser } from "../src/index.ts";
import { normalizedText, parseXml } from "../src/xml.ts";
import {
  buildFixtureEpub,
  buildZip,
  FIXTURE_COVER_BYTES,
  fixtureEntries,
  renameEntryBytes,
} from "./fixtures/build-fixture.ts";

const parser = new YauzlEpubParser();

describe("YauzlEpubParser", () => {
  it("parses title, author, source lang and cover", async () => {
    const book = await parser.parse(await buildFixtureEpub());
    expect(book.title).toBe("迷子の本");
    expect(book.author).toBe("ネコクロ");
    expect(book.sourceLang).toBe("ja");
    expect(book.coverHref).toBe("image/cover.png");
  });

  it("groups spine items into chapters by nav targets", async () => {
    const book = await parser.parse(await buildFixtureEpub());
    expect(book.chapters.map((c) => [c.id, c.index, c.title])).toEqual([
      ["ch-0", 0, "Front matter"],
      ["ch-1", 1, "第一章　「始まり」"],
      ["ch-2", 2, "第二章　「約束」"],
      ["ch-contents", -1, "Contents"],
    ]);
    expect(book.chapters[0]?.docHrefs).toEqual(["xhtml/p-cover.xhtml", "xhtml/p-001.xhtml"]);
    expect(book.chapters[1]?.docHrefs).toEqual(["xhtml/p-005.xhtml", "xhtml/p-006.xhtml"]);
    expect(book.chapters[2]?.docHrefs).toEqual(["xhtml/p-010.xhtml", "xhtml/p-011.xhtml"]);
  });

  it("segment ids are docHref#ordinal and skip image-only pages", async () => {
    const book = await parser.parse(await buildFixtureEpub());
    const ids = book.segments.filter((s) => s.chapterId === "ch-1").map((s) => s.id);
    expect(ids).toEqual([
      "xhtml/p-005.xhtml#0",
      "xhtml/p-005.xhtml#1",
      "xhtml/p-005.xhtml#2",
      "xhtml/p-005.xhtml#3",
      "xhtml/p-006.xhtml#0",
      "xhtml/p-006.xhtml#1",
    ]);
    expect(book.segments.some((s) => s.id.startsWith("xhtml/p-cover"))).toBe(false);
    expect(book.segments.some((s) => s.id.startsWith("xhtml/p-011"))).toBe(false);
  });

  it("encodes ruby as base text and span as paired tokens", async () => {
    const book = await parser.parse(await buildFixtureEpub());
    const texts = new Map(book.segments.map((s) => [s.id, s.sourceText]));
    expect(texts.get("xhtml/p-005.xhtml#0")).toBe("<1>第一章</1>　<2>「始まり」</2>");
    expect(texts.get("xhtml/p-005.xhtml#2")).toBe("　頭を撫でて、<1>できて</1>いなかった。");
    expect(texts.get("xhtml/p-005.xhtml#3")).toBe("あっ<1>!?</1>");
    expect(texts.get("xhtml/p-006.xhtml#1")).toBe("　Tom &amp; Jerry。");
  });

  it("includes nav labels, title and ncx labels in Contents chapter", async () => {
    const book = await parser.parse(await buildFixtureEpub());
    const contents = book.segments.filter((s) => s.chapterId === "ch-contents");
    expect(contents.map((s) => [s.id, s.sourceText])).toEqual([
      ["opf#title", "迷子の本"],
      ["navigation-documents.xhtml#0", "目次"],
      ["navigation-documents.xhtml#1", "第一章　「始まり」"],
      ["navigation-documents.xhtml#2", "第二章　「約束」"],
      ["navigation-documents.xhtml#3", "ガイド"],
      ["navigation-documents.xhtml#4", "表紙"],
      ["ncx#0", "第一章　「始まり」"],
      ["ncx#1", "第二章　「約束」"],
    ]);
  });

  it("accepts mimetype-not-first input", async () => {
    const book = await parser.parse(await buildFixtureEpub({ mimetypeLast: true }));
    expect(book.chapters).toHaveLength(4);
  });

  it("accepts mimetype-first input", async () => {
    const book = await parser.parse(await buildFixtureEpub({ mimetypeLast: false }));
    expect(book.chapters).toHaveLength(4);
  });

  it("rejects a content document without a body", async () => {
    const bad = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head></html>`;
    const bytes = await buildFixtureEpub({ extra: { "item/xhtml/p-005.xhtml": bad } });
    await expect(parser.parse(bytes)).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("chapter titles leave out ruby readings", () => {
    const doc = parseXml(
      new TextEncoder().encode(
        '<a xmlns="http://www.w3.org/1999/xhtml">第<ruby>漢<rt>かん</rt></ruby>章</a>',
      ),
      "t.xhtml",
    );
    expect(normalizedText(doc.documentElement)).toBe("第漢章");
  });

  it("rejects entity declarations", async () => {
    const evil = `<?xml version="1.0"?>
<!DOCTYPE html [ <!ENTITY xxe "boom"> ]>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>&xxe;</p></body></html>`;
    const bytes = await buildFixtureEpub({ extra: { "item/xhtml/p-005.xhtml": evil } });
    await expect(parser.parse(bytes)).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("rejects doctype internal subsets", async () => {
    const evil = `<?xml version="1.0"?>
<!DOCTYPE html [ <!ELEMENT p ANY> ]>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>x</p></body></html>`;
    const bytes = await buildFixtureEpub({ extra: { "item/xhtml/p-005.xhtml": evil } });
    await expect(parser.parse(bytes)).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("rejects zip-slip entry names", async () => {
    const zip = await buildZip([...fixtureEntries(), { name: "AA/evil.txt", data: "x" }]);
    const bytes = renameEntryBytes(zip, "AA/evil.txt", "../evil.txt");
    await expect(parser.parse(bytes)).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("rejects entries over size cap", async () => {
    const small = new YauzlEpubParser({ maxEntryBytes: FIXTURE_COVER_BYTES.length - 1 });
    await expect(small.parse(await buildFixtureEpub())).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("rejects archives with too many entries", async () => {
    const small = new YauzlEpubParser({ maxEntries: 3 });
    await expect(small.parse(await buildFixtureEpub())).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("rejects bytes that are not a zip", async () => {
    await expect(parser.parse(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(InvalidEpubError);
  });

  it("rejects a zip without container.xml", async () => {
    const bytes = await buildZip([{ name: "mimetype", data: "application/epub+zip" }]);
    await expect(parser.parse(bytes)).rejects.toBeInstanceOf(InvalidEpubError);
  });
});
