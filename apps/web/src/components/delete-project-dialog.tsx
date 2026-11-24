import type { ProjectDetail } from "@et/contracts";
import { useNavigate } from "@tanstack/react-router";
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
  if (count === 0) return "It has no volumes.";
  const volumes = count === 1 ? "1 volume" : `${count} volumes`;
  return `${volumes} will be deleted with it, along with all of their translations.`;
}

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteProject(project.id);
  const navigate = useNavigate();

  const onConfirm = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Deleted “${project.name}”`);
        void navigate({ to: "/" });
      },
      onError: () => toast.error("Could not delete the project"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this project?</DialogTitle>
          <DialogDescription className="break-words">
            “{project.name}” will be removed. {consequence(project.books.length)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
