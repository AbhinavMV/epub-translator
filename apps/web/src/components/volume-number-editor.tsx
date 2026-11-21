import type { BookSummary } from "@et/contracts";
import { Pencil } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useSetVolumeNumber } from "@/api/queries";
import { BookCard } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectVolume({
  book,
  deleting,
  onDelete,
}: {
  book: BookSummary;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <BookCard book={book} deleting={deleting} onDelete={onDelete} />
      <VolumeNumberEditor book={book} />
    </div>
  );
}

export function VolumeNumberEditor({ book }: { book: BookSummary }) {
  const save = useSetVolumeNumber(book.id);
  const [draft, setDraft] = useState<string | null>(null);
  const title = book.translatedTitle || book.title;

  if (draft === null) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-xs text-muted-foreground"
        aria-label={`Edit volume number of ${title}`}
        onClick={() => setDraft(book.volumeNumber?.toString() ?? "")}
      >
        <Pencil /> Volume
      </Button>
    );
  }

  const value = draft.trim() === "" ? Number.NaN : Number(draft);
  const valid = Number.isFinite(value) && value >= 0;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    save.mutate(value, {
      onSuccess: () => setDraft(null),
      onError: () => toast.error("Could not change the volume number"),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-1">
      <Input
        aria-label={`Volume number of ${title}`}
        type="number"
        min={0}
        step="any"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-8 w-20"
      />
      <Button type="submit" size="sm" disabled={!valid || save.isPending}>
        Save
      </Button>
    </form>
  );
}
