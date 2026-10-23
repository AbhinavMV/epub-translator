import { useMemo } from "react";
import { sanitize } from "@/lib/sanitize";
import { cn } from "@/lib/utils";

export function Html({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => sanitize(html), [html]);
  return (
    <div
      className={cn("book-html", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
