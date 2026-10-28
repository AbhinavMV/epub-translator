import { NotFoundError, type RenderedChapter } from "@et/core";
import { describe, expect, it } from "vitest";
import { XmlChapterRenderer, YauzlEpubAssets } from "../src/index.ts";
import { FIXTURE_COVER_BYTES } from "./fixtures/build-fixture.ts";
import { parsedFixture, prefixed, translateAll } from "./support.ts";

const renderer = new XmlChapterRenderer();
const assetUrl = (href: string) => `/api/assets/${href}`;

type SegmentBlock = Extract<RenderedChapter["blocks"][number], { kind: "segment" }>;

function segments(view: RenderedChapter): SegmentBlock[] {
  return view.blocks.filter((b): b is SegmentBlock => b.kind === "segment");
}

describe("XmlChapterRenderer", () => {
  it("renders segment pairs and static image blocks with rewritten asset urls", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = translateAll(book, prefixed);
    const view = await renderer.render(bytes, book, "ch-2", translations, assetUrl);

    expect(view.blocks.map((b) => b.kind)).toEqual(["segment", "segment", "static"]);
    const first = segments(view)[0];
    expect(first?.id).toBe("xhtml/p-010.xhtml#0");
    expect(first?.status).toBe("done");
    expect(first?.sourceHtml).toBe('<h1 id="toc-002">第二章　「約束」</h1>');
    expect(first?.targetHtml).toBe('<h1 id="toc-002">EN:第二章　「約束」</h1>');
    const staticBlock = view.blocks[2];
    expect(staticBlock?.kind === "static" && staticBlock.html).toContain(
      'src="/api/assets/image/kuchie-001.png"',
    );
  });

  it("keeps ruby in source html and drops it from target html", async () => {
    const { bytes, book } = await parsedFixture();
    const view = await renderer.render(bytes, book, "ch-1", translateAll(book, prefixed), assetUrl);
    const withRuby = segments(view).find((s) => s.id === "xhtml/p-005.xhtml#2");
    expect(withRuby?.sourceHtml).toContain("<ruby>撫<rt>な</rt></ruby>");
    expect(withRuby?.targetHtml).not.toContain("<rt>");
    expect(withRuby?.targetHtml).toContain('<span class="em-sesame">できて</span>');
  });

  it("renders pending segments with targetHtml null", async () => {
    const { bytes, book } = await parsedFixture();
    const view = await renderer.render(bytes, book, "ch-1", new Map(), assetUrl);
    expect(segments(view).every((s) => s.status === "pending" && s.targetHtml === null)).toBe(true);
    expect(segments(view)).toHaveLength(6);
  });

  it("passes the failure reason of a segment through to the view", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = new Map([
      ["xhtml/p-005.xhtml#1", { text: "", status: "failed" as const, note: "The model declined" }],
    ]);
    const view = await renderer.render(bytes, book, "ch-1", translations, assetUrl);
    const failed = segments(view).find((s) => s.id === "xhtml/p-005.xhtml#1");
    expect(failed).toMatchObject({
      status: "failed",
      note: "The model declined",
      targetHtml: null,
    });
  });

  it("falls back to plain text when a translation breaks its tokens", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = new Map([
      ["xhtml/p-005.xhtml#3", { text: "Oh <1>!?", status: "done" as const }],
    ]);
    const view = await renderer.render(bytes, book, "ch-1", translations, assetUrl);
    const seg = segments(view).find((s) => s.id === "xhtml/p-005.xhtml#3");
    expect(seg?.targetHtml).toBe("<p>Oh !?</p>");
  });

  it("links neighbouring chapters", async () => {
    const { bytes, book } = await parsedFixture();
    const view = await renderer.render(bytes, book, "ch-1", new Map(), assetUrl);
    expect([view.prevChapterId, view.nextChapterId, view.index, view.title]).toEqual([
      "ch-0",
      "ch-2",
      1,
      "第一章　「始まり」",
    ]);
  });

  it("renders the Contents chapter as label segments only", async () => {
    const { bytes, book } = await parsedFixture();
    const translations = new Map([["opf#title", { text: "A Lost Book", status: "done" as const }]]);
    const view = await renderer.render(bytes, book, "ch-contents", translations, assetUrl);
    expect(view.blocks.every((b) => b.kind === "segment")).toBe(true);
    expect(segments(view)[0]).toMatchObject({
      id: "opf#title",
      sourceHtml: "迷子の本",
      targetHtml: "A Lost Book",
    });
    expect(segments(view)).toHaveLength(14);
  });

  it("throws NotFoundError for an unknown chapter", async () => {
    const { bytes, book } = await parsedFixture();
    await expect(renderer.render(bytes, book, "nope", new Map(), assetUrl)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("YauzlEpubAssets", () => {
  const assets = new YauzlEpubAssets();

  it("reads an entry by OPF-relative href with the manifest media type", async () => {
    const { bytes } = await parsedFixture();
    const found = await assets.read(bytes, "image/cover.png");
    expect(found?.mediaType).toBe("image/png");
    expect(found?.bytes).toEqual(FIXTURE_COVER_BYTES);
  });

  it("returns null for hrefs outside the manifest", async () => {
    const { bytes } = await parsedFixture();
    expect(await assets.read(bytes, "image/missing.png")).toBeNull();
    expect(await assets.read(bytes, "../META-INF/container.xml")).toBeNull();
  });
});
