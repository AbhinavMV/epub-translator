import { languageName, PREFERRED_TARGET_LANG } from "@et/contracts";
import { Badge } from "@/components/ui/badge";

export function TranslatedBadge({
  lang,
  text = "Translated",
}: {
  lang: string | null | undefined;
  text?: string;
}) {
  if (!lang) return null;
  const label = lang === PREFERRED_TARGET_LANG ? text : `${text} · ${languageName(lang)}`;
  return <Badge variant="secondary">{label}</Badge>;
}

export function FullyTranslatedBadge({ lang }: { lang: string | null }) {
  return <TranslatedBadge lang={lang} text="Fully translated" />;
}
