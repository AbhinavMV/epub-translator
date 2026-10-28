import type { ChapterBlock } from "@et/contracts";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_PART_BYTES,
  type ChapterRenderer,
  NotFoundError,
  paginateBlocks,
  type RenderedChapter,
  renderChapter,
} from "../../src/index.ts";
import { MemoryBlobs, MemoryBooks, MemoryTranslations, sampleParsed } from "./fakes.ts";

const sizeOf = (blocks: ChapterBlock[]) => new TextEncoder().encode(JSON.stringify(blocks)).length;

function segment(i: number, chars: number): ChapterBlock {
  return {
    kind: "segment",
    id: `a.xhtml#${i}`,
    sourceHtml: `<p>${"字".repeat(chars)}</p>`,
    targetHtml: null,
    status: "pending",
  };
}

describe("paginateBlocks", () => {
  it("splits a chapter over 5 MB into parts that each fit the budget and rejoin exactly", () => {
    const blocks = Array.from({ length: 2200 }, (_, i) => segment(i, 1000));
    expect(sizeOf(blocks)).toBeGreaterThan(5 * 1024 * 1024);

    const parts = paginateBlocks(blocks, CHAPTER_PART_BYTES);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(sizeOf(part)).toBeLessThanOrEqual(CHAPTER_PART_BYTES);
    expect(parts.flat()).toEqual(blocks);
  });

  it("is deterministic", () => {
    const blocks = Array.from({ length: 50 }, (_, i) => segment(i, 300));
    expect(paginateBlocks(blocks, 4000)).toEqual(paginateBlocks(blocks, 4000));
  });

  it("counts static blocks such as inline images by their html", () => {
    const image: ChapterBlock = { kind: "static", html: `<img alt="${"x".repeat(900)}">` };
    const parts = paginateBlocks([image, image, image], 1000);
    expect(parts).toHaveLength(3);
  });

  it("gives an oversized block a part of its own instead of dropping it", () => {
    const parts = paginateBlocks([segment(0, 10), segment(1, 5000), segment(2, 10)], 1000);
    expect(parts.map((p) => p.length)).toEqual([1, 1, 1]);
  });

  it("returns one empty part for an empty chapter", () => {
    expect(paginateBlocks([], 1000)).toEqual([[]]);
  });
});

describe("renderChapter parts", () => {
  const blocks = Array.from({ length: 40 }, (_, i) => segment(i, 200));
  const renderer: ChapterRenderer = {
    async render(_bytes, _book, chapterId): Promise<RenderedChapter> {
      return {
        chapterId,
        index: 0,
        title: "t",
        prevChapterId: null,
        nextChapterId: "ch-1",
        blocks,
      };
    },
  };

  async function setup() {
    const books = new MemoryBooks();
    const blobs = new MemoryBlobs();
    await books.insert(
      {
        id: "b1",
        sha256: "s",
        title: "本",
        author: null,
        sourceLang: "ja",
        coverHref: null,
        createdAt: "",
      },
      sampleParsed,
    );
    await blobs.put("books/s.epub", new Uint8Array([1]));
    return { books, blobs, translations: new MemoryTranslations(), renderer };
  }

  const input = (part: number) => ({
    bookId: "b1",
    jobId: null,
    chapterId: "ch-0",
    part,
    partBytes: 3000,
    assetUrl: (h: string) => h,
  });

  it("returns the requested slice with its position and count", async () => {
    const deps = await setup();
    const first = await renderChapter(deps, input(0));
    const last = await renderChapter(deps, input(first.partCount - 1));

    expect(first.part).toBe(0);
    expect(first.partCount).toBeGreaterThan(2);
    expect(last.part).toBe(first.partCount - 1);
    expect(last.nextChapterId).toBe("ch-1");
  });

  it("concatenates every part back into the full block list", async () => {
    const deps = await setup();
    const { partCount } = await renderChapter(deps, input(0));
    const joined: ChapterBlock[] = [];
    for (let p = 0; p < partCount; p++)
      joined.push(...(await renderChapter(deps, input(p))).blocks);
    expect(joined).toEqual(blocks);
  });

  it("rejects a part past the end", async () => {
    const deps = await setup();
    const { partCount } = await renderChapter(deps, input(0));
    await expect(renderChapter(deps, input(partCount))).rejects.toBeInstanceOf(NotFoundError);
  });
});
