import type { GlossaryEntry } from "@et/contracts";
import type { ParsedSegment } from "../domain/book.ts";

export interface ChapterWork {
  pending: ParsedSegment[];
  context: { source: string; target: string }[];
}

export function chapterSegmentIds(
  book: { segments: readonly ParsedSegment[] },
  chapterId: string,
): string[] {
  return book.segments.filter((s) => s.chapterId === chapterId).map((s) => s.id);
}

export function chapterWork(
  segments: readonly ParsedSegment[],
  existing: ReadonlyMap<string, { text: string; status: string }>,
): ChapterWork {
  const work: ChapterWork = { pending: [], context: [] };
  for (const s of segments) {
    const t = existing.get(s.id);
    if (t?.status === "done") work.context.push({ source: s.sourceText, target: t.text });
    if (!t || t.status === "failed") work.pending.push(s);
  }
  return work;
}

export function promptExtras(
  customPrompt: string,
  glossary: GlossaryEntry[],
): { instructions?: string; glossary?: GlossaryEntry[] } {
  const extras: { instructions?: string; glossary?: GlossaryEntry[] } = {};
  if (customPrompt.trim()) extras.instructions = customPrompt;
  if (glossary.length > 0) extras.glossary = glossary;
  return extras;
}
