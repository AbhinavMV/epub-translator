import { Loader2, UploadCloud } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function isEpub(file: File): boolean {
  return file.name.toLowerCase().endsWith(".epub");
}

export function UploadDropzone({
  onUpload,
  busy = false,
}: {
  onUpload: (file: File) => void;
  busy?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (files: FileList | File[] | null | undefined) => {
    const file = files?.[0];
    if (!file) return;
    if (!isEpub(file)) {
      setError(`"${file.name}" is not an .epub file. Only .epub books are supported.`);
      return;
    }
    setError(null);
    onUpload(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handle(e.dataTransfer?.files);
  };

  return (
    <div>
      <fieldset
        aria-label="EPUB dropzone"
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "m-0 flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
        {busy ? (
          <Loader2 className="size-7 animate-spin text-primary" />
        ) : (
          <UploadCloud className="size-7 text-primary" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">{busy ? "Importing book…" : "Drop an EPUB here"}</p>
          <p className="text-xs text-muted-foreground">
            or{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              browse your files
            </button>
            . Books stay on this machine.
          </p>
        </div>
        <input
          ref={inputRef}
          data-testid="epub-input"
          type="file"
          accept=".epub,application/epub+zip"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </fieldset>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
