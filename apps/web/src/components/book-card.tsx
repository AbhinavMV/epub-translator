import type { BookSummary } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function BookCard({
  book,
  deleting,
  onDelete,
}: {
  book: BookSummary;
  deleting: boolean;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const shownTitle = book.translatedTitle || book.title;
  const original = shownTitle !== book.title ? book.title : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <Link
        to="/books/$bookId"
        params={{ bookId: book.id }}
        search={{}}
        className="flex flex-1 flex-col outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
          {book.coverUrl && !coverFailed ? (
            <img
              src={book.coverUrl}
              alt=""
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 p-4 text-center font-serif text-lg text-primary">
              {book.title.slice(0, 2)}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <h3 className="line-clamp-2 min-h-[2.5rem] text-sm leading-tight font-semibold">
                {shownTitle}
              </h3>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {original ? `${shownTitle} — ${original}` : shownTitle}
            </TooltipContent>
          </Tooltip>
          {original && <p className="truncate text-xs text-muted-foreground">{original}</p>}
          <p className="truncate text-xs text-muted-foreground">
            {book.author ?? "Unknown author"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {book.chapterCount} chapters
            {book.sourceLang ? ` · ${book.sourceLang.toUpperCase()}` : ""}
          </p>
        </div>
      </Link>
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={`Delete ${shownTitle}`}
        className="absolute top-2 right-2 opacity-100 shadow-sm md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        onClick={() => setConfirm(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this book?</DialogTitle>
            <DialogDescription>
              “{shownTitle}” and all of its translations will be removed from this machine.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                onDelete();
                setConfirm(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
