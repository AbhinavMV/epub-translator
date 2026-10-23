import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getTargetLanguage } from "@et/contracts";
import { describe, expect, it } from "vitest";
import { readZip, YauzlEpubParser, YazlEpubExporter } from "../src/index.ts";
import { fixedClock, identity, parsedFixture, prefixed, translateAll } from "./support.ts";

const en = getTargetLanguage("en");
const clock = fixedClock("2026-10-23T12:34:56.789Z");
const exporter = new YazlEpubExporter(clock);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

async function exportPrefixed(only?: (chapterId: string) => boolean) {
  const { bytes, book } = await parsedFixture();
  const out = await exporter.export(bytes, book, translateAll(book, prefixed, only), en);
  return { bytes, book, out, entries: await readZip(out) };
}

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
    const out = await exporter.export(bytes, book, translateAll(book, identity), en);
    const before = await readZip(bytes);
    const after = await readZip(out);
    for (const name of [
      "META-INF/container.xml",
      "item/style/book-style.css",
      "item/image/cover.png",
      "item/image/kuchie-001.png",
      "item/xhtml/p-cover.xhtml",
      "item/xhtml/p-011.xhtml",
    ]) {
      expect(after.get(name), name).toEqual(before.get(name));
    }
    expect([...after.keys()]).toEqual([
      "mimetype",
      ...[...before.keys()].filter((k) => k !== "mimetype"),
      "item/et-override.css",
    ]);
  });

  it("export leaves documents without translations untouched", async () => {
    const { bytes, entries } = await (async () => {
      const r = await exportPrefixed((id) => id === "ch-1");
      return { bytes: r.bytes, entries: r.entries };
    })();
    const before = await readZip(bytes);
    expect(entries.get("item/xhtml/p-010.xhtml")).toEqual(before.get("item/xhtml/p-010.xhtml"));
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).toContain("EN:");
  });

  it("export keeps source text for failed segments", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = translateAll(book, prefixed);
    translations.set("xhtml/p-006.xhtml#1", { text: "", status: "failed" });
    const entries = await readZip(await exporter.export(bytes, book, translations, en));
    expect(text(entries.get("item/xhtml/p-006.xhtml"))).toContain("Tom &amp; Jerry");
  });

  it("export falls back to plain text when tokens are broken", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = new Map([
      ["xhtml/p-005.xhtml#3", { text: "Oh <1>!?", status: "flagged" as const }],
    ]);
    const entries = await readZip(await exporter.export(bytes, book, translations, en));
    expect(text(entries.get("item/xhtml/p-005.xhtml"))).toContain("<p>Oh !?</p>");
  });

  it("export adds a unique manifest item for the override stylesheet", async () => {
    const { entries } = await exportPrefixed();
    const opf = text(entries.get("item/standard.opf"));
    expect(opf.match(/et-override\.css/g)).toHaveLength(1);
  });
});

const epubcheckJar = process.env.EPUBCHECK_JAR;

describe("epubcheck", () => {
  it.skipIf(!epubcheckJar)(
    "exported fixture passes epubcheck with no new errors",
    async () => {
      const { bytes, book } = await parsedFixture();
      const out = await exporter.export(bytes, book, translateAll(book, prefixed), en);
      const dir = await mkdtemp(join(tmpdir(), "et-epubcheck-"));
      const count = async (name: string, data: Uint8Array) => {
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
          messages: { severity: string }[];
        };
        return json.messages.filter((m) => m.severity === "ERROR" || m.severity === "FATAL").length;
      };
      expect(await count("out", out)).toBeLessThanOrEqual(await count("src", bytes));
    },
    120_000,
  );
});
