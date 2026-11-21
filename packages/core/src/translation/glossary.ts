import type { GlossaryEntry } from "@et/contracts";
import { stripTokens } from "./placeholders.ts";

export function glossaryUsedIn(
  glossary: readonly GlossaryEntry[],
  texts: readonly string[],
): GlossaryEntry[] {
  const haystack = texts.map(stripTokens).join("\n");
  return glossary.filter((g) => haystack.includes(g.source));
}
