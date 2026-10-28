import { MAX_BATCH_RESULT_SEGMENTS, type ResultSegment } from "@et/contracts";

export const CHUNK_SEGMENTS = Math.min(500, MAX_BATCH_RESULT_SEGMENTS);
export const CHUNK_BYTES = 2_000_000;

const encoder = new TextEncoder();

export function chunkSegments(segments: readonly ResultSegment[]): ResultSegment[][] {
  const chunks: ResultSegment[][] = [];
  let current: ResultSegment[] = [];
  let used = 0;
  for (const segment of segments) {
    const size = encoder.encode(JSON.stringify(segment)).length + 1;
    if (current.length > 0 && (current.length >= CHUNK_SEGMENTS || used + size > CHUNK_BYTES)) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(segment);
    used += size;
  }
  chunks.push(current);
  return chunks;
}
