import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getTargetLanguage } from "@et/contracts";
import { describe, expect, it } from "vitest";
import { readZip, YauzlEpubParser, YazlEpubExporter } from "../src/index.ts";
import { descendants, parseXml } from "../src/xml.ts";
import { fixedClock, identity, parsedFixture, prefixed, translateAll } from "./support.ts";

const en = getTargetLanguage("en");
const ar = getTargetLanguage("ar");
const translation = { layout: "translation" } as const;
const bilingual = { layout: "bilingual" } as const;
const clock = fixedClock("2026-10-23T12:34:56.789Z");
const exporter = new YazlEpubExporter(clock);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

async function exportPrefixed(
  only?: (chapterId: string) => boolean,
  options: { layout: "translation" | "bilingual" } = translation,
  target = en,
) {
  const { bytes, book } = await parsedFixture();
  const out = await exporter.export(
    bytes,
    book,
    translateAll(book, prefixed, only),
    target,
    options,
  );
  return { bytes, book, out, entries: await readZip(out) };
}

const xml = (bytes: Uint8Array | undefined, href: string) =>
  parseXml(bytes ?? new Uint8Array(), href, "application/xhtml+xml");

describe("YazlEpubExporter bilingual layout", () => {
  it("keeps every source block and adds a translated copy after it", async () => {
    const { entries } = await exportPrefixed(undefined, bilingual);
    const doc = xml(entries.get("item/xhtml/p-005.xhtml"), "p-005");
    const paragraphs = descendants(doc.documentElement, "p");
    const sources = paragraphs.filter((p) => p.getAttribute("class") !== "et-translation");
    const copies = paragraphs.filter((p) => p.getAttribute("class") === "et-translation");
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      expect(copy.getAttribute("lang")).toBe("en");
      expect(copy.getAttribute("dir")).toBe("ltr");
      const previous = copy.previousSibling as Element;
      expect(copy.textContent).toMatch(/^EN:/);
      expect(previous.getAttribute("class")).not.toBe("et-translation");
    }
    expect(sources.map((p) => p.textContent)).toContain("「まずいな……」");
    const quote = copies.find((c) => c.previousSibling?.textContent === "「まずいな……」");
    expect(quote?.textContent).toBe("EN:「まずいな……」");
  });

  it("leaves document language alone and keeps ids unique", async () => {
    const { entries } = await exportPrefixed(undefined, bilingual);
    const raw = text(entries.get("item/xhtml/p-005.xhtml"));
    expect(raw).toMatch(/<html[^>]* xml:lang="ja"/);
    expect(raw.match(/id="toc-001"/g)).toHaveLength(1);
    expect(text(entries.get("item/et-override.css"))).toContain(".et-translation");
  });

  it("keeps the nav list items and adds translations inside the labels", async () => {
    const { entries } = await exportPrefixed(undefined, bilingual);
    const nav = text(entries.get("item/navigation-documents.xhtml"));
    expect(nav.match(/<li[ >]/g)).toHaveLength(3);
    expect(nav).toMatch(
      /<a href="xhtml\/p-005.xhtml#toc-001">第一章　「始まり」<br\/><span [^>]*>EN:第一章　「始まり」<\/span><\/a>/,
    );
  });

  it("lists the source language first and the target second", async () => {
    const { entries } = await exportPrefixed(undefined, bilingual);
    const opf = text(entries.get("item/standard.opf"));
    expect(opf).toMatch(/<dc:language>ja<\/dc:language>\s*<dc:language>en<\/dc:language>/);
    expect(opf).toMatch(/<package[^>]* xml:lang="ja"/);
    expect(opf).toContain('<dc:title id="title">迷子の本 / EN:迷子の本</dc:title>');
  });

  it("converts a vertical source to horizontal pages that turn left to right", async () => {
    const { entries } = await exportPrefixed(undefined, bilingual);
    const opf = text(entries.get("item/standard.opf"));
    expect(opf).toContain('<meta name="primary-writing-mode" content="horizontal-lr"/>');
    expect(opf).toContain('page-progression-direction="ltr"');
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).not.toContain("vrtl");
  });

  it("keeps the source title when the title is untranslated", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = translateAll(book, prefixed);
    translations.delete("opf#title");
    const entries = await readZip(await exporter.export(bytes, book, translations, en, bilingual));
    expect(text(entries.get("item/standard.opf"))).toContain(
      '<dc:title id="title">迷子の本</dc:title>',
    );
  });

  it("re-parses with every source segment still present", async () => {
    const { book, out } = await exportPrefixed(undefined, bilingual);
    const reparsed = await new YauzlEpubParser().parse(out);
    expect(reparsed.sourceLang).toBe("ja");
    const bySource = new Map(reparsed.segments.map((s) => [s.id, s.sourceText]));
    for (const s of book.segments.filter((x) => x.id.startsWith("xhtml/p-005"))) {
      expect(bySource.get(s.id), s.id).toBeDefined();
    }
  });
});

describe("YazlEpubExporter right-to-left targets", () => {
  it("marks documents, package and spine rtl and never forces a direction in css", async () => {
    const { entries } = await exportPrefixed(undefined, translation, ar);
    const opf = text(entries.get("item/standard.opf"));
    expect(opf).toMatch(/<package[^>]* dir="rtl"/);
    expect(opf).toContain("<dc:language>ar</dc:language>");
    expect(opf).toContain('page-progression-direction="rtl"');
    expect(opf).toContain('<meta name="primary-writing-mode" content="horizontal-rl"/>');
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).toMatch(/<html[^>]* dir="rtl"/);
    expect(text(entries.get("item/et-override.css"))).not.toMatch(/direction\s*:/);
  });

  it("marks left-to-right targets explicitly so a source dir cannot leak", async () => {
    const { entries } = await exportPrefixed();
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).toMatch(/<html[^>]* dir="ltr"/);
    expect(text(entries.get("item/standard.opf"))).toMatch(/<package[^>]* dir="ltr"/);
  });
});

describe("YazlEpubExporter", () => {
  it("export writes mimetype first stored with no extra field", async () => {
    const { out } = await exportPrefixed();
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    const nameLength = view.getUint16(26, true);
    expect(view.getUint16(28, true)).toBe(0);
    expect(text(out.subarray(30, 30 + nameLength))).toBe("mimetype");
    expect(text(out.subarray(30 + nameLength, 30 + nameLength + 20))).toBe("application/epub+zip");
  });

  it("export sets target lang on opf and documents", async () => {
    const { entries } = await exportPrefixed();
    const opf = text(entries.get("item/standard.opf"));
    expect(opf).toContain("<dc:language>en</dc:language>");
    expect(opf).toMatch(/<package[^>]* xml:lang="en"/);
    expect(opf).toContain('<dc:title id="title">EN:迷子の本</dc:title>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-23T12:34:56Z</meta>');
    expect(opf).toContain('<dc:identifier id="jdcn">08631644018188000000</dc:identifier>');

    const doc = text(entries.get("item/xhtml/p-005.xhtml"));
    expect(doc).toMatch(/<html[^>]* xml:lang="en"/);
    expect(doc).toMatch(/<html[^>]* lang="en"/);
    expect(doc).not.toContain('xml:lang="ja"');
    expect(doc.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html')).toBe(
      true,
    );
  });

  it("export sets ltr and injects horizontal override", async () => {
    const { entries } = await exportPrefixed();
    const opf = text(entries.get("item/standard.opf"));
    expect(opf).toContain('page-progression-direction="ltr"');
    expect(opf).toContain('href="et-override.css"');
    expect(text(entries.get("item/et-override.css"))).toContain(
      "writing-mode: horizontal-tb !important",
    );

    const doc = text(entries.get("item/xhtml/p-005.xhtml"));
    expect(doc).toContain('<link rel="stylesheet" type="text/css" href="../et-override.css"/>');
    expect(doc).not.toContain("vrtl");
  });

  it("export translates nav and ncx labels", async () => {
    const { entries } = await exportPrefixed();
    const nav = text(entries.get("item/navigation-documents.xhtml"));
    expect(nav).toContain('<a href="xhtml/p-005.xhtml#toc-001">EN:第一章　「始まり」</a>');
    expect(nav).toContain("<h1>EN:目次</h1>");
    const ncx = text(entries.get("item/toc.ncx"));
    expect(ncx).toContain("<text>EN:第二章　「約束」</text>");
  });

  it("export output re-parses with translated segments", async () => {
    const { book, out } = await exportPrefixed();
    const reparsed = await new YauzlEpubParser().parse(out);
    expect(reparsed.sourceLang).toBe("en");
    expect(reparsed.chapters.map((c) => c.docHrefs)).toEqual(book.chapters.map((c) => c.docHrefs));
    const bySource = new Map(reparsed.segments.map((s) => [s.id, s.sourceText]));
    expect(bySource.size).toBe(book.segments.length);
    for (const s of book.segments) {
      expect(bySource.get(s.id), s.id).toBe(`EN:${s.sourceText}`);
    }
  });

  it("identity export keeps untouched entries byte-identical", async () => {
    const { bytes, book } = await parsedFixture();
    const out = await exporter.export(bytes, book, translateAll(book, identity), en, translation);
    const before = await readZip(bytes);
    const after = await readZip(out);
    for (const name of [
      "META-INF/container.xml",
      "item/style/book-style.css",
      "item/image/cover.png",
      "item/image/kuchie-001.png",
    ]) {
      expect(after.get(name), name).toEqual(before.get(name));
    }
    expect([...after.keys()]).toEqual([
      "mimetype",
      ...[...before.keys()].filter((k) => k !== "mimetype"),
      "item/et-override.css",
    ]);
  });

  it("export makes untranslated text documents horizontal but keeps their language", async () => {
    const { entries } = await exportPrefixed((id) => id === "ch-1");
    const untranslated = text(entries.get("item/xhtml/p-010.xhtml"));
    expect(untranslated).not.toContain("EN:");
    expect(untranslated).toContain('xml:lang="ja"');
    expect(untranslated).not.toContain("vrtl");
    expect(untranslated).toContain("et-override.css");
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).toContain("EN:");
  });

  it("export makes image-only pages horizontal too", async () => {
    const { entries } = await exportPrefixed();
    for (const page of ["item/xhtml/p-cover.xhtml", "item/xhtml/p-011.xhtml"]) {
      expect(text(entries.get(page)), page).toContain("et-override.css");
    }
  });

  it("export rewrites the kindle writing mode and mirrors page spreads", async () => {
    const { entries } = await exportPrefixed();
    const opf = text(entries.get("item/standard.opf"));
    expect(opf).toContain('<meta name="primary-writing-mode" content="horizontal-lr"/>');
    expect(opf).toContain('<itemref idref="p-cover" properties="page-spread-right"/>');
  });

  it("export keeps source text for failed segments", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = translateAll(book, prefixed);
    translations.set("xhtml/p-006.xhtml#1", { text: "", status: "failed" });
    const entries = await readZip(
      await exporter.export(bytes, book, translations, en, translation),
    );
    expect(text(entries.get("item/xhtml/p-006.xhtml"))).toContain("Tom &amp; Jerry");
  });

  it("export falls back to plain text when tokens are broken", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = new Map([
      ["xhtml/p-005.xhtml#3", { text: "Oh <1>!?", status: "flagged" as const }],
    ]);
    const entries = await readZip(
      await exporter.export(bytes, book, translations, en, translation),
    );
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).toContain("<p>Oh !?</p>");
  });

  it("export adds a unique manifest item for the override stylesheet", async () => {
    const { entries } = await exportPrefixed();
    const opf = text(entries.get("item/standard.opf"));
    expect(opf.match(/et-override\.css/g)).toHaveLength(1);
  });
});

describe("YazlEpubExporter metadata", () => {
  const opfOf = async (...args: Parameters<typeof exportPrefixed>) => {
    const { entries } = await exportPrefixed(...args);
    return xml(entries.get("item/standard.opf"), "standard.opf");
  };
  const metas = (opf: Document, refines: string) =>
    descendants(opf.documentElement, "meta")
      .filter((m) => m.getAttribute("refines") === `#${refines}`)
      .map((m) => [m.getAttribute("property"), m.getAttribute("xml:lang"), m.textContent]);
  const dc = (opf: Document, name: string) =>
    descendants(opf.documentElement, name).map((e) => e.textContent);

  it("replaces creators, publisher, description and subjects with their translations", async () => {
    const opf = await opfOf();
    expect(dc(opf, "creator")).toEqual(["EN:ネコクロ", "EN:絵師"]);
    expect(dc(opf, "publisher")).toEqual(["EN:株式会社 集英社"]);
    expect(dc(opf, "description")).toEqual(["EN:隣の席の天使様。"]);
    expect(dc(opf, "subject")).toEqual(["EN:ライトノベル", "EN:ラブコメ"]);
  });

  it("keeps the original as an alternate-script in the source language", async () => {
    const opf = await opfOf();
    expect(metas(opf, "creator01")).toContainEqual(["alternate-script", "ja", "ネコクロ"]);
    expect(metas(opf, "publisher")).toContainEqual(["alternate-script", "ja", "株式会社 集英社"]);
    expect(metas(opf, "title")).toContainEqual(["alternate-script", "ja", "迷子の本"]);
  });

  it("gives an id to a translated element that had none", async () => {
    const opf = await opfOf();
    const description = descendants(opf.documentElement, "description")[0] as Element;
    const id = description.getAttribute("id");
    expect(id).toBeTruthy();
    expect(metas(opf, id as string)).toContainEqual(["alternate-script", "ja", "隣の席の天使様。"]);
  });

  it("drops source-script file-as readings of translated elements and keeps roles", async () => {
    const opf = await opfOf();
    const props = metas(opf, "creator01").map((m) => m[0]);
    expect(props).not.toContain("file-as");
    expect(props).toContain("role");
  });

  it("never gives an alternate-script the language of the element it refines", async () => {
    const opf = await opfOf();
    expect(opf.documentElement.getAttribute("xml:lang")).toBe("en");
    for (const m of descendants(opf.documentElement, "meta")) {
      if (m.getAttribute("property") === "alternate-script") {
        expect(m.getAttribute("xml:lang")).not.toBe("en");
      }
    }
  });

  it("leaves metadata alone when the Contents chapter is not translated", async () => {
    const opf = await opfOf((id) => id !== "ch-contents");
    expect(dc(opf, "creator")).toEqual(["ネコクロ", "絵師"]);
    expect(
      descendants(opf.documentElement, "meta").map((m) => m.getAttribute("property")),
    ).not.toContain("alternate-script");
    expect(metas(opf, "creator01").map((m) => m[0])).toContain("file-as");
  });

  it("bilingual keeps the original text and adds the translation as alternate-script", async () => {
    const opf = await opfOf(undefined, bilingual);
    expect(dc(opf, "creator")).toEqual(["ネコクロ", "絵師"]);
    expect(metas(opf, "creator01")).toContainEqual(["alternate-script", "en", "EN:ネコクロ"]);
    expect(metas(opf, "creator01").map((m) => m[0])).toContain("file-as");
    expect(dc(opf, "title")).toEqual(["迷子の本 / EN:迷子の本"]);
  });

  it("replaces content document head titles that equal the source title", async () => {
    const { entries } = await exportPrefixed();
    const head = (href: string) =>
      descendants(xml(entries.get(href), href).documentElement, "title")[0]?.textContent;
    expect(head("item/xhtml/p-001.xhtml")).toBe("EN:迷子の本");
    expect(head("item/xhtml/p-cover.xhtml")).toBe("EN:迷子の本");
    expect(head("item/navigation-documents.xhtml")).toBe("目次");
  });

  it("bilingual head titles read original then translation", async () => {
    const { entries } = await exportPrefixed(undefined, bilingual);
    const doc = xml(entries.get("item/xhtml/p-001.xhtml"), "p-001");
    expect(descendants(doc.documentElement, "title")[0]?.textContent).toBe(
      "迷子の本 / EN:迷子の本",
    );
  });
});

const epubcheckJar = process.env.EPUBCHECK_JAR;

describe("epubcheck", () => {
  const cases = [
    ["translation", en, translation],
    ["bilingual", en, bilingual],
    ["arabic translation", ar, translation],
    ["arabic bilingual", ar, bilingual],
  ] as const;

  it.skipIf(!epubcheckJar).each(cases)(
    "%s export of the fixture passes epubcheck with no new errors",
    async (_name, target, options) => {
      const { bytes, book } = await parsedFixture();
      const out = await exporter.export(bytes, book, translateAll(book, prefixed), target, options);
      const dir = await mkdtemp(join(tmpdir(), "et-epubcheck-"));
      const errors = async (name: string, data: Uint8Array) => {
        const epub = join(dir, `${name}.epub`);
        const report = join(dir, `${name}.json`);
        await writeFile(epub, data);
        await promisify(execFile)("java", [
          "-jar",
          epubcheckJar as string,
          epub,
          "--json",
          report,
        ]).catch(() => undefined);
        const json = JSON.parse(await readFile(report, "utf8")) as {
          messages: { severity: string; ID: string }[];
        };
        return json.messages
          .filter((m) => m.severity === "ERROR" || m.severity === "FATAL")
          .map((m) => m.ID);
      };
      const source = await errors("src", bytes);
      const exported = await errors("out", out);
      expect(exported.length).toBeLessThanOrEqual(source.length);
      expect(exported.filter((id) => !source.includes(id))).toEqual([]);
    },
    120_000,
  );
});
