import { getTargetLanguage, type ProofreadInput, type ProofreadSegment } from "@et/contracts";
import type { Repositories } from "../../ports/stores.ts";
import { promptExtras } from "../chapter-work.ts";
import { projectTermsFor } from "../project-terms.ts";
import { loadChapterJob } from "../work/plan-work-unit.ts";

export const PROOFREAD_PART_CHARS = 12_000;

export function splitProofreadParts(
  segments: readonly ProofreadSegment[],
  maxChars: number,
): ProofreadSegment[][] {
  const parts: ProofreadSegment[][] = [];
  let current: ProofreadSegment[] = [];
  let size = 0;
  for (const s of segments) {
    const length = s.source.length + s.translation.length;
    if (current.length > 0 && size + length > maxChars) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(s);
    size += length;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export async function proofreadInput(
  repos: Repositories,
  jobId: string,
  chapterId: string,
  partChars = PROOFREAD_PART_CHARS,
): Promise<ProofreadInput> {
  const { job, parsed } = await loadChapterJob(repos, jobId, chapterId);
  const terms = await projectTermsFor(repos, job.bookId);
  const segments = parsed.segments.filter((s) => s.chapterId === chapterId);
  const translations = await repos.translations.forSegments(
    jobId,
    segments.map((s) => s.id),
  );
  const items = segments.flatMap((s) => {
    const t = translations.get(s.id);
    return t && t.status !== "failed" && t.text.trim() !== ""
      ? [{ id: s.id, source: s.sourceText, translation: t.text }]
      : [];
  });
  const { instructions } = promptExtras(terms.customPrompt, []);
  return {
    sourceLang: job.sourceLang,
    target: getTargetLanguage(job.targetLang),
    bookTitle: parsed.title,
    ...(instructions ? { instructions } : {}),
    glossary: terms.glossary,
    parts: splitProofreadParts(items, partChars),
  };
}
