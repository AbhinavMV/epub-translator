import { getTargetLanguage, type SuggestGlossaryBody } from "@et/contracts";
import { FatalProviderError, finalizeTerms } from "@et/core";
import type { BrowserProvider } from "@et/providers/browser";
import type { GlossarySuggestion } from "@/api/client";
import type { KeyedProvider } from "@/keys/envelope";
import type { WorkApi } from "./work-api";

export async function suggestTermsInBrowser(
  deps: { api: WorkApi; bundleFor(provider: KeyedProvider): BrowserProvider },
  bookId: string,
  body: SuggestGlossaryBody,
  signal: AbortSignal = new AbortController().signal,
): Promise<GlossarySuggestion> {
  const targetLang = body.targetLang ?? "en";
  const sample = await deps.api.glossarySample(bookId, targetLang);
  const result = await deps.bundleFor(body.provider as KeyedProvider).terms.extractTerms(
    {
      model: body.model,
      sourceLang: sample.sourceLang,
      target: getTargetLanguage(targetLang),
      bookTitle: sample.bookTitle,
      sample: sample.sample,
      existing: sample.existing,
    },
    signal,
  );
  if (result.kind !== "ok") throw new FatalProviderError(result.cause);
  return { terms: finalizeTerms(result.terms, sample.existing), usage: result.usage };
}
