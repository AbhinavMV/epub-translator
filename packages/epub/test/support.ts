import type { Clock, ParsedBook, SegmentTranslation } from "@et/core";
import { YauzlEpubParser } from "../src/index.ts";
import { buildFixtureEpub } from "./fixtures/build-fixture.ts";

export const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

export interface ParsedFixture {
  bytes: Uint8Array;
  book: ParsedBook;
}

export async function parsedFixture(): Promise<ParsedFixture> {
  const bytes = await buildFixtureEpub();
  return { bytes, book: await new YauzlEpubParser().parse(bytes) };
}

export function translateAll(
  book: ParsedBook,
  transform: (sourceText: string) => string,
  only?: (chapterId: string) => boolean,
): Map<string, SegmentTranslation> {
  const map = new Map<string, SegmentTranslation>();
  for (const s of book.segments) {
    if (only && !only(s.chapterId)) continue;
    map.set(s.id, { text: transform(s.sourceText), status: "done" });
  }
  return map;
}

export const identity = (text: string) => text;
export const prefixed = (text: string) => `EN:${text}`;
