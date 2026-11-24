import type { BookDetail } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { BookOpen, Menu } from "lucide-react";
import { AppHeader, useVolumeCrumbs } from "@/components/app-header";
import { Button } from "@/components/ui/button";

export function EditorHeader({
  bookId,
  book,
  translatedTitle,
  chapterId,
  jobId,
  onOpenRail,
}: {
  bookId: string;
  book: BookDetail | undefined;
  translatedTitle: string | null | undefined;
  chapterId: string | undefined;
  jobId: string | undefined;
  onOpenRail: () => void;
}) {
  const crumbs = useVolumeCrumbs(book, translatedTitle);
  return (
    <AppHeader
      crumbs={crumbs}
      leading={
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open chapters"
          onClick={onOpenRail}
        >
          <Menu />
        </Button>
      }
      actions={
        chapterId ? (
          <Button variant="ghost" asChild>
            <Link
              to="/books/$bookId/read/$chapterId"
              params={{ bookId, chapterId }}
              search={{ job: jobId }}
              aria-label="Read"
            >
              <BookOpen />
              <span className="max-sm:hidden">Read</span>
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
