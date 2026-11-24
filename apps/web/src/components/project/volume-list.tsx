import { type BookSummary, CONTENTS_CHAPTER_ID } from "@et/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Check, FolderInput, Hash, MoreHorizontal, PenLine, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/api-context";
import { keys } from "@/api/keys";
import { useDeleteBook } from "@/api/queries";
import { volumeLabel } from "@/components/app-header";
import { CoverPlaceholder } from "@/components/cover-placeholder";
import { MoveBookDialog } from "@/components/move-book-dialog";
import { ProgressBar } from "@/components/status-line";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VolumeNumberForm } from "@/components/volume-number-editor";
import { lastOpenedStore } from "@/lib/last-opened-store";
import { volumeProgress } from "@/lib/progress-status";
import { cn } from "@/lib/utils";

function useOpenReader() {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (book: BookSummary) => {
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: keys.book(book.id),
        queryFn: () => api.getBook(book.id),
      });
      const last = lastOpenedStore.get();
      const resumable =
        last?.bookId === book.id && detail.chapters.some((c) => c.id === last.chapterId);
      const chapterId = resumable
        ? last.chapterId
        : detail.chapters.find((c) => c.id !== CONTENTS_CHAPTER_ID)?.id;
      if (!chapterId) {
        toast.error(`“${book.translatedTitle || book.title}” has no chapters to read`);
        return;
      }
      await navigate({
        to: "/books/$bookId/read/$chapterId",
        params: { bookId: book.id, chapterId },
      });
    } catch {
      toast.error(`Could not open “${book.translatedTitle || book.title}”`);
    }
  };
}

export function VolumeList({
  books,
  mainLang,
}: {
  books: readonly BookSummary[];
  mainLang: string | null;
}) {
  return (
    <ul
      aria-label="Volumes"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card lg:grid lg:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] lg:gap-x-5 lg:gap-y-7 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent"
    >
      {books.map((book) => (
        <VolumeRow key={book.id} book={book} mainLang={mainLang} />
      ))}
    </ul>
  );
}

function VolumeRow({ book, mainLang }: { book: BookSummary; mainLang: string | null }) {
  const labelId = useId();
  const [editing, setEditing] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const status = volumeProgress(book, mainLang);
  const label = volumeLabel(book);
  const title = book.translatedTitle || book.title;
  const original = title !== book.title ? book.title : null;
  const numbered = book.volumeNumber != null;

  return (
    <li
      aria-labelledby={labelId}
      className={cn(
        "grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 border-t py-2.5 pr-1 pl-3 first:border-t-0 hover:bg-secondary/40",
        "sm:grid-cols-[3rem_minmax(0,1fr)_minmax(8rem,11rem)_auto] sm:gap-x-4 sm:px-3.5 sm:py-3",
        "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-2 lg:gap-y-1 lg:border-t-0 lg:p-0 lg:hover:bg-transparent",
      )}
    >
      <Link
        to="/books/$bookId"
        params={{ bookId: book.id }}
        search={{}}
        aria-label={numbered ? `${label}: ${title}` : title}
        className="group col-start-1 row-span-3 row-start-1 self-start rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring lg:col-end-3 lg:row-span-1 lg:mb-2"
      >
        <div className="aspect-[2/3] w-full overflow-hidden rounded-r-md rounded-l-sm bg-muted shadow-[inset_4px_0_0_rgb(0_0_0/0.12)] transition-[transform,box-shadow] lg:group-hover:-translate-y-0.5 lg:group-hover:shadow-md">
          {book.coverUrl && !coverFailed ? (
            <img
              src={book.coverUrl}
              alt=""
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <CoverPlaceholder
              title={book.title}
              className="p-0.5 text-xs sm:text-sm lg:p-4 lg:text-lg"
            />
          )}
        </div>
      </Link>

      <div className="col-start-2 row-start-1 min-w-0 lg:col-start-1 lg:col-end-3 lg:row-start-2">
        {editing ? (
          <VolumeNumberForm book={book} onDone={() => setEditing(false)} />
        ) : (
          <span
            id={labelId}
            className="block truncate text-sm font-semibold tabular-nums"
            data-overflow="clip"
            title={label}
          >
            {label}
          </span>
        )}
      </div>

      {numbered ? (
        <span
          className="col-start-2 col-end-4 row-start-2 min-w-0 truncate text-sm text-muted-foreground sm:col-end-3 sm:text-foreground lg:col-start-1 lg:col-end-3 lg:row-start-3 lg:line-clamp-2 lg:min-h-[2.7em] lg:font-semibold lg:leading-snug lg:whitespace-normal lg:break-words"
          data-overflow="clip"
          title={original ? `${title} — ${original}` : title}
          lang={original ? undefined : (book.sourceLang ?? undefined)}
        >
          {title}
        </span>
      ) : null}

      {original ? (
        <span
          className="col-start-2 row-start-3 hidden min-w-0 truncate text-xs text-muted-foreground sm:block lg:hidden"
          data-overflow="clip"
          title={original}
          lang={book.sourceLang ?? undefined}
        >
          {original}
        </span>
      ) : null}

      <span
        className={cn(
          "col-start-3 row-start-1 flex min-w-0 items-start justify-end gap-1 text-right text-xs leading-[18px] tabular-nums break-words",
          "sm:justify-start sm:self-end sm:text-left lg:col-start-1 lg:row-start-4 lg:self-center",
          status.done ? "font-medium text-ok" : "text-muted-foreground",
        )}
      >
        {status.done && <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
        <span className="min-w-0">{status.text}</span>
      </span>
      {status.ratio > 0 && !status.done ? (
        <ProgressBar
          ratio={status.ratio}
          label={`${label}: ${status.text}`}
          className="col-start-2 col-end-4 row-start-3 sm:col-start-3 sm:col-end-4 sm:row-start-2 sm:mt-1.5 sm:self-start lg:col-start-1 lg:col-end-2 lg:row-start-5 lg:mt-1"
        />
      ) : null}

      <div className="col-start-4 row-span-3 row-start-1 flex items-center gap-1 lg:col-start-2 lg:row-span-2 lg:row-start-4">
        <VolumeActions book={book} label={label} onEditNumber={() => setEditing(true)} />
      </div>
    </li>
  );
}

function VolumeActions({
  book,
  label,
  onEditNumber,
}: {
  book: BookSummary;
  label: string;
  onEditNumber: () => void;
}) {
  const openReader = useOpenReader();
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const keepFocus = useRef(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex lg:hidden"
        onClick={() => void openReader(book)}
      >
        <BookOpen aria-hidden />
        Read
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${label} actions`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          className="w-56 max-w-(--radix-dropdown-menu-content-available-width)"
          onCloseAutoFocus={(e) => {
            if (keepFocus.current) e.preventDefault();
            keepFocus.current = false;
          }}
        >
          <DropdownMenuItem asChild>
            <Link to="/books/$bookId" params={{ bookId: book.id }} search={{}}>
              <PenLine /> Open editor
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void openReader(book)}>
            <BookOpen /> Read
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              keepFocus.current = true;
              onEditNumber();
            }}
          >
            <Hash /> Change volume number
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMoving(true)}>
            <FolderInput /> Move to project…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete volume…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveBookDialog book={book} open={moving} onOpenChange={setMoving} />
      <DeleteVolumeDialog book={book} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}

function DeleteVolumeDialog({
  book,
  open,
  onOpenChange,
}: {
  book: BookSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteBook();
  const title = book.translatedTitle || book.title;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this volume?</DialogTitle>
          <DialogDescription className="break-words">
            “{title}” and all of its translations will be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(book.id, {
                onSuccess: () => onOpenChange(false),
                onError: () => toast.error(`Could not delete “${title}”`),
              })
            }
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
