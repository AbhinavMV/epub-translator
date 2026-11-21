import type { ProjectDetail } from "@et/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDeleteProject } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function consequence(count: number) {
  if (count === 0) return "It has no books.";
  const books = count === 1 ? "1 book" : `${count} books`;
  return `${books} will be deleted with it, along with all of their translations.`;
}

export function DeleteProjectButton({ project }: { project: ProjectDetail | undefined }) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteProject(project?.id ?? "");
  const navigate = useNavigate();

  const onConfirm = () => {
    if (!project) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Deleted “${project.name}”`);
        void navigate({ to: "/" });
      },
      onError: () => toast.error("Could not delete the project"),
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete project"
        disabled={!project}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog open={open && project !== undefined} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              “{project?.name}” will be removed. {consequence(project?.books.length ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={onConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
