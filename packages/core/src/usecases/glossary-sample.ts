import type { GlossarySamplePlan, SampleSize } from "@et/contracts";
import type { ParsedBook } from "../domain/book.ts";
import { SampleChunkOutOfRangeError } from "../domain/errors.ts";
import { stripTokens } from "../translation/placeholders.ts";

export const SAMPLE_CHARS = { standard: 12_000, large: 40_000 } as const;
export const CHUNK_CHARS = 40_000;
export const DEFAULT_SAMPLE_SIZE: SampleSize = "large";

export interface SampleChunk {
  sample: string;
  chunks: number;
}

const METADATA_ID = /^(opf|ncx)#/;
const NAV_SHARE = 0.25;

const clean = (text: string) => stripTokens(text).trim();

function navTexts(book: ParsedBook): string[] {
  const nav = book.segments.filter((s) => METADATA_ID.test(s.id)).map((s) => clean(s.sourceText));
  return [...book.chapters.map((c) => c.title.trim()), ...nav].filter(Boolean);
}

function bodyTexts(book: ParsedBook): string[] {
  return book.segments
    .filter((s) => !METADATA_ID.test(s.id))
    .map((s) => clean(s.sourceText))
    .filter(Boolean);
}

export function buildSample(book: ParsedBook, maxChars: number): string {
  const header = navTexts(book)
    .join("\n")
    .slice(0, Math.floor(maxChars * NAV_SHARE));

  const body = bodyTexts(book);
  const budget = maxChars - header.length - 2;
  const total = body.reduce((n, t) => n + t.length + 1, 0);

  let picked = body;
  if (total > budget && body.length > 0) {
    const average = total / body.length;
    const count = Math.max(1, Math.floor((budget / average) * 0.9));
    picked = Array.from(
      { length: count },
      (_, i) => body[Math.floor((i * body.length) / count)] ?? "",
    );
  }

  const parts: string[] = [];
  let used = 0;
  for (const text of picked) {
    if (used + text.length + 1 > budget) break;
    parts.push(text);
    used += text.length + 1;
  }
  return `${header}\n\n${parts.join("\n")}`.slice(0, maxChars);
}

export function volumeChunks(book: ParsedBook, chunkChars = CHUNK_CHARS): string[] {
  const pieces = [...navTexts(book), ...bodyTexts(book)].flatMap((text) => {
    const out: string[] = [];
    for (let at = 0; at < text.length; at += chunkChars) out.push(text.slice(at, at + chunkChars));
    return out;
  });

  const chunks: string[] = [];
  let current: string[] = [];
  let used = 0;
  for (const piece of pieces) {
    const added = current.length === 0 ? piece.length : piece.length + 1;
    if (current.length > 0 && used + added > chunkChars) {
      chunks.push(current.join("\n"));
      current = [piece];
      used = piece.length;
    } else {
      current.push(piece);
      used += added;
    }
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current.join("\n"));
  return chunks;
}

function samples(book: ParsedBook, size: SampleSize): string[] {
  return size === "volume" ? volumeChunks(book) : [buildSample(book, SAMPLE_CHARS[size])];
}

export function sampleChunk(book: ParsedBook, size: SampleSize, chunk: number): SampleChunk {
  const all = samples(book, size);
  const sample = all[chunk];
  if (sample === undefined) throw new SampleChunkOutOfRangeError(chunk, all.length);
  return { sample, chunks: all.length };
}

export function samplePlan(book: ParsedBook, size: SampleSize): GlossarySamplePlan {
  const all = samples(book, size);
  return { requests: all.length, chars: all.reduce((n, s) => n + s.length, 0) };
}
