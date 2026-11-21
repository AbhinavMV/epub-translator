import { useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/api-context";
import type { PendingImport } from "@/api/client";
import { usePrepareImport, useProjects } from "@/api/queries";
import { UserMenu } from "@/auth/user-menu";
import { AppMark } from "@/components/app-mark";
import { ImportDialog } from "@/components/import-dialog";
import { ProjectCard } from "@/components/project-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDropzone } from "@/components/upload-dropzone";

export function LibraryPage() {
  const api = useApi();
  const projects = useProjects();
  const prepare = usePrepareImport();
  const [pending, setPending] = useState<(PendingImport & { preview: { kind: "new" } }) | null>(
    null,
  );

  const onUpload = (file: File) => {
    prepare.mutate(file, {
      onSuccess: (prepared) => {
        const { preview } = prepared;
        if (preview.kind === "duplicate") {
          toast.info(`“${preview.book.title}” is already in your library`);
        } else {
          setPending({ ...prepared, preview });
        }
      },
      onError: () => toast.error(`Could not read ${file.name}`),
    });
  };

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center gap-3">
        <AppMark />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-xl font-semibold">EPUB Translator</h1>
          <p className="text-sm text-muted-foreground">
            Your library, translated chapter by chapter.
          </p>
        </div>
        <ThemeToggle />
        <UserMenu />
      </header>

      <UploadDropzone
        onUpload={onUpload}
        busy={prepare.isPending}
        maxBytes={api.upload.maxBytes}
        hosted={api.upload.mode === "signed"}
      />

      <ImportDialog pending={pending} onClose={() => setPending(null)} />

      <section aria-labelledby="library-heading" className="flex flex-col gap-4">
        <h2
          id="library-heading"
          className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
        >
          Library {projects.data ? `· ${projects.data.length}` : ""}
        </h2>
        {projects.isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
            ))}
          </div>
        ) : projects.data && projects.data.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {projects.data.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No projects yet. Drop an EPUB above to start one.
          </p>
        )}
      </section>
    </div>
  );
}
