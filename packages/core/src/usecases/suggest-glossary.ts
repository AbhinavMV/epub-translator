import { type GlossaryEntry, getTargetLanguage, type Usage } from "@et/contracts";
import type { ParsedBook } from "../domain/book.ts";
import { FatalProviderError } from "../domain/errors.ts";
import type { BookRepository, BookSettingsRepository, JobRepository } from "../ports/stores.ts";
import type { TermExtractor } from "../ports/term-extractor.ts";
import { stripTokens } from "../translation/placeholders.ts";
import { requireBook } from "./load-book.ts";

export const DEFAULT_SAMPLE_CHARS = 12_000;
export const MAX_SUGGESTED_TERMS = 60;

export interface SuggestGlossaryDeps {
  books: BookRepository;
  settings: BookSettingsRepository;
  jobs: JobRepository;
  extractor: TermExtractor;
}

export interface SuggestGlossaryInput {
  bookId: string;
  model: string;
  targetLang: string;
  sampleChars?: number;
}

export interface GlossarySuggestions {
  terms: GlossaryEntry[];
  usage: Usage;
}

const METADATA_ID = /^(opf|ncx)#/;
const NAV_SHARE = 0.25;

export function buildSample(book: ParsedBook, maxChars: number): string {
  const clean = (text: string) => stripTokens(text).trim();
  const nav = book.segments
    .filter((s) => METADATA_ID.test(s.id))
    .map((s) => clean(s.sourceText))
    .filter(Boolean);
  const header = [...book.chapters.map((c) => c.title.trim()), ...nav]
    .filter(Boolean)
    .join("\n")
    .slice(0, Math.floor(maxChars * NAV_SHARE));

  const body = book.segments
    .filter((s) => !METADATA_ID.test(s.id))
    .map((s) => clean(s.sourceText))
    .filter(Boolean);
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
  const existing = (await deps.settings.get(input.bookId)).glossary;

  const result = await deps.extractor.extractTerms(
    {
      model: input.model,
      sourceLang: parsed.sourceLang ?? book.sourceLang,
      target,
      bookTitle: book.title,
      sample: buildSample(parsed, input.sampleChars ?? DEFAULT_SAMPLE_CHARS),
      existing,
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
