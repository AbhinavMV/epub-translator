import type { ImportPlacement, Project } from "@et/contracts";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Loader2, Upload } from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/api-context";
import type { PendingImport } from "@/api/client";
import { useCommitImport, usePrepareImport, useProjects } from "@/api/queries";
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
import { cn } from "@/lib/utils";

type NewImport = PendingImport & { preview: { kind: "new" } };

type UploadState =
  | { open: false }
  | { open: true; step: "choose"; error?: string }
  | { open: true; step: "reading"; file: File }
  | { open: true; step: "place"; file: File; pending: NewImport };

export function isEpub(file: File): boolean {
  return file.name.toLowerCase().endsWith(".epub");
}

function fileProblem(file: File, maxBytes: number | undefined): string | null {
  if (!isEpub(file)) return `“${file.name}” is not an .epub file. Only .epub books are supported.`;
  if (maxBytes !== undefined && file.size > maxBytes) {
    return `“${file.name}” is larger than ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  }
  return null;
}

export function useUploadDialog() {
  const api = useApi();
  const prepare = usePrepareImport();
  const [state, setState] = useState<UploadState>({ open: false });
  const latest = useRef<File | null>(null);

  const choose = (file?: File) => {
    latest.current = file ?? null;
    if (!file) return setState({ open: true, step: "choose" });
    const problem = fileProblem(file, api.upload.maxBytes);
    if (problem) return setState({ open: true, step: "choose", error: problem });
    setState({ open: true, step: "reading", file });
    prepare.mutate(file, {
      onSuccess: (prepared) => {
        if (latest.current !== file) return;
        const { preview } = prepared;
        if (preview.kind === "duplicate") {
          setState({
            open: true,
            step: "choose",
            error: `“${preview.book.title}” is already in your library.`,
          });
        } else {
          setState({ open: true, step: "place", file, pending: { ...prepared, preview } });
        }
      },
      onError: () => {
        if (latest.current !== file) return;
        setState({ open: true, step: "choose", error: `Could not read “${file.name}”.` });
      },
    });
  };

  return {
    state,
    open: choose,
    reveal: () => setState((s) => (s.open ? s : { open: true, step: "choose" })),
    close: () => {
      latest.current = null;
      setState({ open: false });
    },
  };
}

export type UploadDialogController = ReturnType<typeof useUploadDialog>;

const hasFiles = (e: globalThis.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function usePageDrop(upload: UploadDialogController) {
  const ref = useRef(upload);
  useEffect(() => {
    ref.current = upload;
  });
  useEffect(() => {
    const onEnter = (e: globalThis.DragEvent) => {
      if (hasFiles(e)) ref.current.reveal();
    };
    const onOver = (e: globalThis.DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented) return;
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      ref.current.open(file);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}

export function UploadPrivacy({ className }: { className?: string }) {
  const api = useApi();
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {api.upload.mode === "signed"
        ? "Books are stored privately in your account."
        : "Books stay on this machine."}
    </p>
  );
}

export function UploadDialog({
  upload,
  projectId,
}: {
  upload: UploadDialogController;
  projectId?: string;
}) {
  const { state } = upload;
  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && upload.close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload EPUB</DialogTitle>
          <DialogDescription>
            {state.open && state.step === "place"
              ? "Choose the project and volume number."
              : "Each EPUB becomes one volume. You pick the project on the next step."}
          </DialogDescription>
        </DialogHeader>
        {state.open && state.step === "place" ? (
          <PlacementForm
            key={state.pending.preview.title}
            file={state.file}
            pending={state.pending}
            projectId={projectId}
            onChange={() => upload.open()}
            onDone={upload.close}
          />
        ) : state.open ? (
          <FilePicker
            reading={state.step === "reading" ? state.file : null}
            error={state.step === "choose" ? state.error : undefined}
            onFile={upload.open}
            onCancel={upload.close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FilePicker({
  reading,
  error,
  onFile,
  onCancel,
}: {
  reading: File | null;
  error?: string;
  onFile: (file: File) => void;
  onCancel: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && !reading) onFile(file);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <fieldset
        aria-label="Drop an EPUB file"
        data-testid="upload-picker"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "m-0 flex min-w-0 flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-border px-4 py-7 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        {reading ? (
          <>
            <Loader2 aria-hidden className="size-7 animate-spin text-primary" />
            <p className="min-w-0 text-sm font-medium break-words" role="status">
              Reading “{reading.name}”…
            </p>
          </>
        ) : (
          <>
            <Upload aria-hidden className="size-7 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                <span className="coarse:hidden">Drop an EPUB file here</span>
                <span className="hidden coarse:inline">Choose an EPUB file</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="coarse:hidden">or choose one from your computer</span>
                <span className="hidden coarse:inline">From Files, iCloud or Downloads</span>
              </p>
            </div>
            <Button type="button" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          aria-label="EPUB file"
          type="file"
          accept=".epub,application/epub+zip"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm break-words text-destructive">
          {error}
        </p>
      )}
      <UploadPrivacy />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

function PlacementForm({
  file,
  pending,
  projectId: targetProjectId,
  onChange,
  onDone,
}: {
  file: File;
  pending: NewImport;
  projectId?: string;
  onChange: () => void;
  onDone: () => void;
}) {
  const { preview } = pending;
  const ids = useId();
  const navigate = useNavigate();
  const projects = useProjects();
  const commit = useCommitImport();
  const [projectId, setProjectId] = useState(targetProjectId ?? preview.project?.id ?? "");
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
  const suggested = projectId !== "" && projectId === preview.project?.id;

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
          toast.success(
            book.volumeNumber != null
              ? `Added “${book.title}” as Vol. ${book.volumeNumber}`
              : `Added “${book.title}”`,
          );
          onDone();
          if (book.projectId) {
            void navigate({ to: "/projects/$projectId", params: { projectId: book.projectId } });
          }
        },
        onError: () => toast.error(`Could not upload “${preview.title}”`),
      },
    );
  };

  if (projects.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your projects…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-2.5 rounded-md border bg-secondary/50 py-1.5 pr-1.5 pl-3">
        <BookOpen aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm break-words">{file.name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${ids}-project`} className="text-sm font-medium">
          Add to project
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
        {projectId === "" ? (
          <Input
            aria-label="New project name"
            value={projectName}
            maxLength={200}
            onChange={(e) => setProjectName(e.target.value)}
          />
        ) : suggested ? (
          <p className="text-xs text-muted-foreground">
            Suggested because the book’s series title matches.
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${ids}-volume`} className="text-sm font-medium">
          Volume number
        </label>
        <Input
          id={`${ids}-volume`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="Automatic"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          className="max-w-32"
        />
        <p className="text-xs text-muted-foreground">
          Read from the title. Left empty, it becomes the next volume; 2.5 works for side stories.
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready}>
          Add volume
        </Button>
      </DialogFooter>
    </form>
  );
}
