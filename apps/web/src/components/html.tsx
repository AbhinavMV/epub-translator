import { useMemo } from "react";
import type { LanguageAttrs } from "@/lib/language-attrs";
import { sanitize } from "@/lib/sanitize";
import { cn } from "@/lib/utils";

export function Html({
  html,
  className,
  language,
}: {
  html: string;
  className?: string;
  language?: LanguageAttrs | undefined;
}) {
  const clean = useMemo(() => sanitize(html), [html]);
  return (
    <div
      lang={language?.lang}
      dir={language?.dir}
      className={cn("book-html", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
