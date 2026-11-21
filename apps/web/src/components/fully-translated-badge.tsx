import { TARGET_LANGUAGES } from "@et/contracts";
import { Badge } from "@/components/ui/badge";

function label(lang: string): string {
  if (lang === "en") return "Translated";
  return `Translated · ${TARGET_LANGUAGES.find((l) => l.code === lang)?.name ?? lang}`;
}

export function FullyTranslatedBadge({ lang }: { lang: string | null | undefined }) {
  if (!lang) return null;
  return <Badge variant="secondary">{label(lang)}</Badge>;
}
