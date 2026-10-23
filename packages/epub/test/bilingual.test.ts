import { getTargetLanguage } from "@et/contracts";
import { describe, expect, it } from "vitest";
import { insertBilingualCopy } from "../src/bilingual.ts";
import { documentBlocks } from "../src/doc-blocks.ts";
import { parseXml, serializeXml } from "../src/xml.ts";

const en = getTargetLanguage("en");
const ar = getTargetLanguage("ar");

const page = (body: string) =>
  parseXml(
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja"><head><title>t</title></head><body>${body}</body></html>`,
    "t.xhtml",
    "application/xhtml+xml",
  );

function bilingual(body: string, target = en, isNav = false): string {
  const doc = page(body);
  for (const block of documentBlocks(doc, isNav)) {
    insertBilingualCopy(block, { text: `T:${block.textContent}`, status: "done" }, target, isNav);
  }
  return serializeXml(doc);
}

const attrs = `class="et-translation" lang="en" xml:lang="en" dir="ltr"`;

describe("insertBilingualCopy", () => {
  it("places a translated sibling after a paragraph with lang, dir and no id", () => {
    const out = bilingual(`<p id="a" class="x">元</p>`);
    expect(out).toContain(`<p id="a" class="x">元</p><p class="x et-translation"`);
    expect(out).toMatch(/<p [^>]*lang="en"/);
    expect(out).toMatch(/<p [^>]*xml:lang="en"/);
    expect(out).toMatch(/<p [^>]*dir="ltr"[^>]*>T:元<\/p>/);
    expect(out.match(/id="a"/g)).toHaveLength(1);
  });

  it("uses the target direction for rtl languages", () => {
    expect(bilingual(`<p>元</p>`, ar)).toMatch(/<p [^>]*dir="rtl"[^>]*>T:元<\/p>/);
  });

  it("strips ids from inline elements of the copy", () => {
    const out = bilingual(`<p>前<a id="n1" href="#x">注</a>後</p>`);
    expect(out.match(/id="n1"/g)).toHaveLength(1);
  });

  it("keeps the figcaption single by appending inside it", () => {
    const out = bilingual(`<figure><img src="a.png" alt=""/><figcaption>図</figcaption></figure>`);
    expect(out.match(/<figcaption/g)).toHaveLength(1);
    expect(out).toContain(`<figcaption>図<div ${attrs}>T:図</div></figcaption>`);
  });

  it("appends inside list items and table cells instead of adding siblings", () => {
    const li = bilingual(`<ul><li>一</li></ul>`);
    expect(li.match(/<li/g)).toHaveLength(1);
    expect(li).toContain(`<li>一<div ${attrs}>T:一</div></li>`);
    const td = bilingual(`<table><tr><td>二</td><th>三</th></tr></table>`);
    expect(td.match(/<td/g)).toHaveLength(1);
    expect(td.match(/<th/g)).toHaveLength(1);
    expect(td).toContain(`<td>二<div ${attrs}>T:二</div></td>`);
  });

  it("appends inside definition terms and descriptions", () => {
    const out = bilingual(`<dl><dt>語</dt><dd>意</dd></dl>`);
    expect(out.match(/<dt/g)).toHaveLength(1);
    expect(out.match(/<dd/g)).toHaveLength(1);
  });

  it("puts a loose run's translation in a sibling div", () => {
    const out = bilingual(`<div>ばらばら<p>段落</p></div>`);
    expect(out).toContain(`<span class="et-run">ばらばら</span><div ${attrs}>T:ばらばら</div>`);
  });

  it("appends nav labels inline after a line break and never adds list items", () => {
    const out = bilingual(
      `<nav epub:type="toc"><h1>目次</h1><ol><li><a href="a.xhtml">一章</a></li></ol></nav>`,
      en,
      true,
    );
    expect(out.match(/<li/g)).toHaveLength(1);
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain(`<a href="a.xhtml">一章<br/><span ${attrs}>T:一章</span></a>`);
    expect(out).toContain(`<h1>目次<br/><span ${attrs}>T:目次</span></h1>`);
  });

  it("falls back to plain text when tokens are broken", () => {
    const doc = page(`<p>あ<b>い</b></p>`);
    const [block] = documentBlocks(doc, false);
    insertBilingualCopy(block as Element, { text: "A <1>B", status: "flagged" }, en, false);
    expect(serializeXml(doc)).toContain(">A B</p>");
  });
});
