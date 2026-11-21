import type { GlossaryEntry } from "@et/contracts";

export function mergeSuggestions(
  gathered: readonly GlossaryEntry[],
  next: readonly GlossaryEntry[],
): GlossaryEntry[] {
  const seen = new Set(gathered.map((t) => t.source.trim()));
  const merged = [...gathered];
  for (const term of next) {
    const source = term.source.trim();
    if (seen.has(source)) continue;
    seen.add(source);
    merged.push({ ...term, source });
  }
  return merged;
}
