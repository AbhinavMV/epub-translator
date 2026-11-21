import { type GlossaryEntry, getTargetLanguage, type SampleSize, type Usage } from "@et/contracts";
import { FatalProviderError } from "../domain/errors.ts";
import type { BookRepository, JobRepository, ProjectSettingsRepository } from "../ports/stores.ts";
import type { TermExtractor } from "../ports/term-extractor.ts";
import { DEFAULT_SAMPLE_SIZE, sampleChunk } from "./glossary-sample.ts";
import { requireBook } from "./load-book.ts";
import { projectTermsFor } from "./project-terms.ts";

export const MAX_SUGGESTED_TERMS = 60;

export interface SuggestGlossaryDeps {
  books: BookRepository;
  projectSettings: ProjectSettingsRepository;
  jobs: JobRepository;
  extractor: TermExtractor;
}

export interface SuggestGlossaryInput {
  bookId: string;
  model: string;
  targetLang: string;
  sampleSize?: SampleSize;
  chunk?: number;
}

export interface GlossarySuggestions {
  terms: GlossaryEntry[];
  usage: Usage;
}

export function finalizeTerms(terms: GlossaryEntry[], known: GlossaryEntry[]): GlossaryEntry[] {
  return dedupe(terms, known).slice(0, MAX_SUGGESTED_TERMS);
}

function dedupe(terms: GlossaryEntry[], known: GlossaryEntry[]): GlossaryEntry[] {
  const seen = new Set(known.map((t) => t.source.trim()));
  const out: GlossaryEntry[] = [];
  for (const term of terms) {
    const source = term.source.trim();
    const target = term.target.trim();
    if (!source || !target || seen.has(source)) continue;
    seen.add(source);
    out.push({ source, target, ...(term.note?.trim() ? { note: term.note.trim() } : {}) });
  }
  return out;
}

export async function suggestGlossary(
  deps: SuggestGlossaryDeps,
  input: SuggestGlossaryInput,
  signal: AbortSignal,
): Promise<GlossarySuggestions> {
  const { book, parsed } = await requireBook(deps.books, input.bookId);
  const target = getTargetLanguage(input.targetLang);
  const { customPrompt, glossary: existing } = await projectTermsFor(deps, input.bookId);
  const { sample } = sampleChunk(parsed, input.sampleSize ?? DEFAULT_SAMPLE_SIZE, input.chunk ?? 0);

  const result = await deps.extractor.extractTerms(
    {
      model: input.model,
      sourceLang: parsed.sourceLang ?? book.sourceLang,
      target,
      bookTitle: book.title,
      sample,
      existing,
      instructions: customPrompt,
    },
    signal,
  );
  if (result.kind !== "ok") throw new FatalProviderError(result.cause);

  const job = await deps.jobs.findByBookAndLang(input.bookId, target.code);
  if (job) await deps.jobs.addUsage(job.id, result.usage);

  return {
    terms: finalizeTerms(result.terms, existing),
    usage: result.usage,
  };
}
