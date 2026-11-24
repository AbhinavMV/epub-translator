import { languageName } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChapterStatusInfo } from "@/lib/chapter-status";

function original(sourceLang: string | null | undefined): string {
  return sourceLang ? `the original ${languageName(sourceLang)}` : "the original text";
}

function noticeText(status: ChapterStatusInfo, sourceLang?: string | null): string {
  if (status.translated === 0) {
    return `This chapter isn’t translated yet, so it shows ${original(sourceLang)}.`;
  }
  const rest = original(sourceLang);
  return `${status.translated} of ${status.total} passages are translated. The rest show ${rest}.`;
}

export function UntranslatedNotice({
  status,
  sourceLang,
  bookId,
  chapterId,
}: {
  status: ChapterStatusInfo;
  sourceLang?: string | null;
  bookId: string;
  chapterId: string;
}) {
  return (
    <aside
      role="note"
      aria-label="Translation status"
      className="mb-8 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-3 rounded-lg bg-flag/15 px-3.5 py-3 font-sans text-sm leading-snug text-foreground sm:flex sm:items-center sm:gap-3"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-flag sm:mt-0" />
      <p className="m-0 min-w-0 [overflow-wrap:anywhere] sm:flex-1">
        {noticeText(status, sourceLang)}
      </p>
      <Button
        variant="outline"
        className="col-span-full h-auto min-h-9 whitespace-normal coarse:min-h-11 sm:shrink-0"
        asChild
      >
        <Link to="/books/$bookId" params={{ bookId }} search={{ chapter: chapterId }}>
          Translate in editor
        </Link>
      </Button>
    </aside>
  );
}
