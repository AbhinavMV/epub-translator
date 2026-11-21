import type { ImportPlacement, Project } from "@et/contracts";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import type { PendingImport } from "@/api/client";
import { useCommitImport, useProjects } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type NewImport = PendingImport & { preview: { kind: "new" } };

export function ImportDialog({
  pending,
  onClose,
}: {
  pending: NewImport | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {pending && <ImportForm key={pending.preview.title} pending={pending} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ImportForm({ pending, onClose }: { pending: NewImport; onClose: () => void }) {
  const { preview } = pending;
  const ids = useId();
  const projects = useProjects();
  const commit = useCommitImport();
  const [projectId, setProjectId] = useState(preview.project?.id ?? "");
  const [projectName, setProjectName] = useState(preview.seriesTitle || preview.title);
  const [volume, setVolume] = useState(preview.volumeNumber?.toString() ?? "");

  const options: Project[] = [...(projects.data ?? [])];
  if (preview.project && !options.some((p) => p.id === preview.project?.id)) {
    options.unshift(preview.project);
  }
  const volumeNumber = volume.trim() === "" ? null : Number(volume);
  const validVolume = volumeNumber === null || (Number.isFinite(volumeNumber) && volumeNumber >= 0);
  const name = projectName.trim();
  const ready = validVolume && (projectId !== "" || name !== "") && !commit.isPending;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const placement: ImportPlacement = projectId
      ? { projectId, volumeNumber }
      : { projectName: name, volumeNumber };
    commit.mutate(
      { pending, placement },
      {
        onSuccess: (book) => {
          toast.success(`Imported “${book.title}”`);
          onClose();
        },
        onError: () => toast.error(`Could not import “${preview.title}”`),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add to a project</DialogTitle>
        <DialogDescription>“{preview.title}”</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-project`} className="text-sm font-medium">
          Project
        </label>
        <NativeSelect
          id={`${ids}-project`}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">New project</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        {projectId === "" && (
          <Input
            aria-label="New project name"
            value={projectName}
            maxLength={200}
            onChange={(e) => setProjectName(e.target.value)}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-volume`} className="text-sm font-medium">
          Volume number
        </label>
        <Input
          id={`${ids}-volume`}
          type="number"
          min={0}
          step="any"
          placeholder="Automatic"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Left empty, the book becomes volume 1, or the next number after the project's highest
          volume.
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          Import
        </Button>
      </DialogFooter>
    </form>
  );
}
