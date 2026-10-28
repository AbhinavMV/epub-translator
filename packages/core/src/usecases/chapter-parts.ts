import type { ChapterBlock } from "@et/contracts";

export const CHAPTER_PART_BYTES = 1_500_000;

const encoder = new TextEncoder();

export function paginateBlocks(
  blocks: readonly ChapterBlock[],
  maxBytes: number,
): ChapterBlock[][] {
  const parts: ChapterBlock[][] = [];
  let current: ChapterBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    const size = encoder.encode(JSON.stringify(block)).length + 1;
    if (current.length > 0 && used + size > maxBytes) {
      parts.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += size;
  }
  parts.push(current);
  return parts;
}
