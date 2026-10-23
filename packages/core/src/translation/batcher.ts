import type { ParsedSegment } from "../domain/book.ts";

export function batchSegments(
  segments: ParsedSegment[],
  maxChars = 4000,
  maxCount = 40,
): ParsedSegment[][] {
  const batches: ParsedSegment[][] = [];
  let current: ParsedSegment[] = [];
  let chars = 0;
  for (const segment of segments) {
    const size = segment.sourceText.length;
    const full = current.length >= maxCount || chars + size > maxChars;
    if (current.length > 0 && full) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(segment);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
