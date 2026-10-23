import { ZipFile } from "yazl";

export interface ZipEntryInput {
  name: string;
  data: string | Uint8Array;
}

export interface FixtureOptions {
  mimetypeLast?: boolean;
  extra?: Record<string, string>;
}

export const FIXTURE_COVER_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 1, 2, 3, 4]);

const XHTML_NS = "http://www.w3.org/1999/xhtml";
const EPUB_NS = "http://www.idpf.org/2007/ops";

export async function buildZip(entries: ZipEntryInput[]): Promise<Uint8Array> {
  const zip = new ZipFile();
  for (const entry of entries) {
    const buf =
      typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    zip.addBuffer(buf, entry.name, { compress: entry.name !== "mimetype" });
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

export function renameEntryBytes(zip: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error("names must have equal length");
  const out = Buffer.from(zip);
  const needle = Buffer.from(from, "utf8");
  let at = out.indexOf(needle);
  while (at !== -1) {
    Buffer.from(to, "utf8").copy(out, at);
    at = out.indexOf(needle, at + 1);
  }
  return new Uint8Array(out);
}

function xhtml(opts: { cls: string; bodyClass: string; body: string; title?: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html
 xmlns="${XHTML_NS}"
 xmlns:epub="${EPUB_NS}"
 xml:lang="ja"
 class="${opts.cls}"
>
<head>
<meta charset="UTF-8"/>
<title>${opts.title ?? "迷子の本"}</title>
<link rel="stylesheet" type="text/css" href="../style/book-style.css"/>
</head>
<body class="${opts.bodyClass}">
${opts.body}
</body>
</html>
`;
}

const imagePage = (src: string, cls = "hltr") =>
  xhtml({
    cls,
    bodyClass: "p-image",
    body: `<div class="main"><p><img class="fit" src="../image/${src}" alt=""/></p></div>`,
  });

const DOCS: Record<string, string> = {
  "item/xhtml/p-cover.xhtml": imagePage("cover.png"),
  "item/xhtml/p-001.xhtml": xhtml({
    cls: "vrtl",
    bodyClass: "p-text",
    body: `<div class="main">
<p>これは序文です。</p>
</div>`,
  }),
  "item/xhtml/p-005.xhtml": xhtml({
    cls: "vrtl",
    bodyClass: "p-text",
    body: `<div class="main">
<h1 class="h-indent-4em" id="toc-001"><span class="gfont">第一章</span>　<span class="font-140per">「始まり」</span></h1>
<p><br/></p>
<p><br/></p>
<p>「まずいな……」</p>
<p>　頭を<ruby>撫<rt>な</rt></ruby>でて、<span class="em-sesame">できて</span>いなかった。</p>
<p>あっ<span class="tcy">!?</span></p>
</div>`,
  }),
  "item/xhtml/p-006.xhtml": xhtml({
    cls: "vrtl",
    bodyClass: "p-text",
    body: `<div class="main">
<p>　<ruby>俺<rt>おれ</rt></ruby>は<ruby>呟<rt>つぶや</rt></ruby>く。</p>
<p>　Tom &amp; Jerry。</p>
</div>`,
  }),
  "item/xhtml/p-010.xhtml": xhtml({
    cls: "vrtl",
    bodyClass: "p-text",
    body: `<div class="main">
<h1 id="toc-002">第二章　「約束」</h1>
<p>　翌朝になった。</p>
</div>`,
  }),
  "item/xhtml/p-011.xhtml": imagePage("kuchie-001.png", "vrtl"),
};

const NAV = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" xml:lang="ja">
<head>
<meta charset="UTF-8"/>
<title>目次</title>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>目次</h1>
<ol>
<li><a href="xhtml/p-005.xhtml#toc-001">第一章　「始まり」</a></li>
<li><a href="xhtml/p-010.xhtml#toc-002">第二章　「約束」</a></li>
</ol>
</nav>
<nav epub:type="landmarks" id="guide">
<h1>ガイド</h1>
<ol>
<li><a epub:type="cover" href="xhtml/p-cover.xhtml">表紙</a></li>
</ol>
</nav>
</body>
</html>
`;

const NCX = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:test:1"/></head>
<docTitle><text>迷子の本</text></docTitle>
<navMap>
<navPoint id="n1" playOrder="1"><navLabel><text>第一章　「始まり」</text></navLabel><content src="xhtml/p-005.xhtml#toc-001"/></navPoint>
<navPoint id="n2" playOrder="2"><navLabel><text>第二章　「約束」</text></navLabel><content src="xhtml/p-010.xhtml#toc-002"/></navPoint>
</navMap>
</ncx>
`;

const OPF = `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" xml:lang="ja" unique-identifier="jdcn" prefix="ebpaj: http://www.ebpaj.jp/">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="title">迷子の本</dc:title>
    <dc:creator id="creator01">ネコクロ</dc:creator>
    <dc:language>ja</dc:language>
    <dc:identifier id="jdcn">08631644018188000000</dc:identifier>
    <meta property="dcterms:modified">2026-02-28T00:00:00Z</meta>
    <meta name="cover" content="cover"/>
    <meta name="primary-writing-mode" content="vertical-rl"/>
  </metadata>
  <manifest>
    <item media-type="application/xhtml+xml" id="toc" href="navigation-documents.xhtml" properties="nav"/>
    <item media-type="application/x-dtbncx+xml" id="ncx" href="toc.ncx"/>
    <item media-type="text/css" id="book-style" href="style/book-style.css"/>
    <item media-type="image/png" id="cover" href="image/cover.png" properties="cover-image"/>
    <item media-type="image/png" id="kuchie-001" href="image/kuchie-001.png"/>
    <item media-type="application/xhtml+xml" id="p-cover" href="xhtml/p-cover.xhtml"/>
    <item media-type="application/xhtml+xml" id="p-001" href="xhtml/p-001.xhtml"/>
    <item media-type="application/xhtml+xml" id="p-005" href="xhtml/p-005.xhtml"/>
    <item media-type="application/xhtml+xml" id="p-006" href="xhtml/p-006.xhtml"/>
    <item media-type="application/xhtml+xml" id="p-010" href="xhtml/p-010.xhtml"/>
    <item media-type="application/xhtml+xml" id="p-011" href="xhtml/p-011.xhtml"/>
  </manifest>
  <spine toc="ncx" page-progression-direction="rtl">
    <itemref idref="p-cover" properties="page-spread-left"/>
    <itemref idref="p-001"/>
    <itemref idref="p-005"/>
    <itemref idref="p-006"/>
    <itemref idref="p-010"/>
    <itemref idref="p-011"/>
  </spine>
</package>
`;

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="item/standard.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

const CSS = `.vrtl { writing-mode: vertical-rl; }\n.tcy { text-combine-upright: all; }\n`;

export function fixtureEntries(opts: FixtureOptions = {}): ZipEntryInput[] {
  const files = new Map<string, string | Uint8Array>([
    ["META-INF/container.xml", CONTAINER],
    ["item/standard.opf", OPF],
    ["item/navigation-documents.xhtml", NAV],
    ["item/toc.ncx", NCX],
    ["item/style/book-style.css", CSS],
    ["item/image/cover.png", FIXTURE_COVER_BYTES],
    ["item/image/kuchie-001.png", new Uint8Array([9, 8, 7, 6])],
  ]);
  for (const [name, data] of Object.entries(DOCS)) files.set(name, data);
  for (const [name, data] of Object.entries(opts.extra ?? {})) files.set(name, data);
  const entries = [...files].map(([name, data]) => ({ name, data }));
  const mimetype = { name: "mimetype", data: "application/epub+zip" };
  return opts.mimetypeLast === false ? [mimetype, ...entries] : [...entries, mimetype];
}

export function buildFixtureEpub(opts: FixtureOptions = {}): Promise<Uint8Array> {
  return buildZip(fixtureEntries(opts));
}
