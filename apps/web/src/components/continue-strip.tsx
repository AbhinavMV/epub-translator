import { CONTENTS_CHAPTER_ID } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { BookOpen, Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiRequestError } from "@/api/client";
import { useBook, useProject } from "@/api/queries";
import { volumeLabel } from "@/components/app-header";
import { CoverPlaceholder } from "@/components/cover-placeholder";
import { Button } from "@/components/ui/button";
import { type LastOpened, lastOpenedStore, useLastOpened } from "@/lib/last-opened-store";
import { volumeProgress } from "@/lib/progress-status";

export function ContinueStrip() {
  const last = useLastOpened();
  return last ? <ContinueBook key={`${last.bookId}/${last.chapterId}`} last={last} /> : null;
}

function ContinueBook({ last }: { last: LastOpened }) {
  const book = useBook(last.bookId);
  const project = useProject(book.data?.projectId);
  const [coverFailed, setCoverFailed] = useState(false);

  const missing = book.error instanceof ApiRequestError && book.error.status === 404;
  useEffect(() => {
    if (missing) lastOpenedStore.clear();
  }, [missing]);

  if (!book.data) return null;
  const chapters = book.data.chapters.filter((c) => c.id !== CONTENTS_CHAPTER_ID);
  const position = chapters.findIndex((c) => c.id === last.chapterId);
  const volume = project.data?.books.find((b) => b.id === last.bookId);
  const details = [
    book.data.volumeNumber != null ? volumeLabel(book.data) : null,
    position >= 0 ? `Chapter ${position + 1}` : null,
    volume && project.data ? volumeProgress(volume, project.data.mainLang).text : null,
  ].filter(Boolean);
  const name = project.data?.name ?? book.data.translatedTitle ?? book.data.title;

  return (
    <section
      aria-label="Continue"
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div className="aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-r-md rounded-l-sm bg-muted sm:w-12">
          {book.data.coverUrl && !coverFailed ? (
            <img
              src={book.data.coverUrl}
              alt=""
              onError={() => setCoverFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <CoverPlaceholder title={name} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Continue where you left off</p>
          <p className="truncate font-semibold" title={name} data-overflow="clip">
            {name}
          </p>
          {details.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">{details.join(" · ")}</p>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
        <Button asChild variant="outline">
          <Link
            to="/books/$bookId/read/$chapterId"
            params={{ bookId: last.bookId, chapterId: last.chapterId }}
          >
            <BookOpen aria-hidden />
            Read
          </Link>
        </Button>
        <Button asChild>
          <Link
            to="/books/$bookId"
            params={{ bookId: last.bookId }}
            search={{ chapter: last.chapterId }}
          >
            <Languages aria-hidden />
            Translate
          </Link>
        </Button>
      </div>
    </section>
  );
}
