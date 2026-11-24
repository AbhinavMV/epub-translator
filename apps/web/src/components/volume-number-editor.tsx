import type { BookSummary } from "@et/contracts";
import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useSetVolumeNumber } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VolumeNumberForm({ book, onDone }: { book: BookSummary; onDone: () => void }) {
  const save = useSetVolumeNumber(book.id);
  const [draft, setDraft] = useState(book.volumeNumber?.toString() ?? "");
  const title = book.translatedTitle || book.title;

  const value = draft.trim() === "" ? Number.NaN : Number(draft);
  const valid = Number.isFinite(value) && value >= 0;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    save.mutate(value, {
      onSuccess: onDone,
      onError: () => toast.error("Could not change the volume number"),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-wrap items-center gap-1">
      <Input
        aria-label={`Volume number of ${title}`}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
        className="w-20 min-w-0"
      />
      <Button type="submit" size="sm" disabled={!valid || save.isPending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel" onClick={onDone}>
        <X />
      </Button>
    </form>
  );
}
