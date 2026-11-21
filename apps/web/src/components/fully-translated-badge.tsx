import { languageName, PREFERRED_TARGET_LANG } from "@et/contracts";
import { Badge } from "@/components/ui/badge";

function label(lang: string): string {
  if (lang === PREFERRED_TARGET_LANG) return "Fully translated";
  return `Fully translated · ${languageName(lang)}`;
}

export function FullyTranslatedBadge({ lang }: { lang: string | null }) {
  if (!lang) return null;
  return <Badge variant="secondary">{label(lang)}</Badge>;
}
