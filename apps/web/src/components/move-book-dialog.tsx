import type { BookSummary } from "@et/contracts";
import { FolderInput } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { useMoveBook, useProjects } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

export function MoveBookButton({ book }: { book: BookSummary }) {
  const [open, setOpen] = useState(false);
  const title = book.translatedTitle || book.title;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        aria-label={`Move ${title} to another project`}
        onClick={() => setOpen(true)}
      >
        <FolderInput /> Move
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open && <MoveBookForm book={book} title={title} onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MoveBookForm({
  book,
  title,
  onClose,
}: {
  book: BookSummary;
  title: string;
  onClose: () => void;
}) {
  const id = useId();
  const projects = useProjects();
  const move = useMoveBook(book.id);
  const [projectId, setProjectId] = useState("");
  const options = (projects.data ?? []).filter((p) => p.id !== book.projectId);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    move.mutate(projectId, {
      onSuccess: () => {
        toast.success(`Moved “${title}”`);
        onClose();
      },
      onError: () => toast.error(`Could not move “${title}”`),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Move to another project</DialogTitle>
        <DialogDescription>
          “{title}” keeps its translations. Its volume number is read again from its title, and the
          new project's glossary applies from now on.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          Project
        </label>
        <NativeSelect id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="" disabled>
            {options.length > 0 || projects.isPending ? "Choose a project" : "No other projects"}
          </option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!projectId || move.isPending}>
          Move
        </Button>
      </DialogFooter>
    </form>
  );
}
