import type { ProjectDetail } from "@et/contracts";
import { useParams } from "@tanstack/react-router";
import { Languages, Pencil } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useDeleteBook, useProject, useRenameProject } from "@/api/queries";
import { AppHeader } from "@/components/app-header";
import { DeleteProjectButton } from "@/components/delete-project-dialog";
import { FullyTranslatedBadge } from "@/components/fully-translated-badge";
import { ProjectTermsSection } from "@/components/project/project-terms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadDialog, usePageDrop, useUploadDialog } from "@/components/upload/upload-dialog";
import { ProjectVolume } from "@/components/volume-number-editor";
import { translatedProjectName } from "@/lib/translated-project-name";

function ProjectName({ project }: { project: ProjectDetail }) {
  const rename = useRenameProject(project.id);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    const translatedName = translatedProjectName(project.books);
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <h1 className="min-w-0 font-serif text-xl font-semibold break-words">{project.name}</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rename project"
            onClick={() => setDraft(project.name)}
          >
            <Pencil />
          </Button>
          <DeleteProjectButton project={project} />
        </div>
        {translatedName && translatedName !== project.name ? (
          <Button variant="outline" size="sm" onClick={() => setDraft(translatedName)}>
            <Languages />
            Use translated title
          </Button>
        ) : null}
        <FullyTranslatedBadge lang={project.fullyTranslatedLang} />
      </div>
    );
  }

  const trimmed = draft.trim();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    rename.mutate(trimmed, {
      onSuccess: () => setDraft(null),
      onError: () => toast.error("Could not rename the project"),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Project name"
        value={draft}
        maxLength={200}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDraft(null);
        }}
        className="min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto"
      />
      <Button type="submit" size="sm" disabled={!trimmed || rename.isPending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
        Cancel
      </Button>
    </form>
  );
}

export function ProjectPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const project = useProject(projectId);
  const remove = useDeleteBook();
  const upload = useUploadDialog();
  usePageDrop(upload);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        crumbs={[
          { kind: "library" },
          { kind: "current", label: project.data?.name ?? (project.isError ? "Project" : "…") },
        ]}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
        <UploadDialog upload={upload} projectId={projectId} />
        <header className="flex flex-col gap-4">
          {project.data ? (
            <ProjectName project={project.data} />
          ) : (
            <Skeleton className="h-8 w-48" />
          )}
        </header>

        <ProjectTermsSection projectId={projectId} books={project.data?.books ?? []} />

        <section aria-labelledby="volumes-heading" className="flex flex-col gap-4">
          <h2
            id="volumes-heading"
            className="font-mono text-xs tracking-widest text-muted-foreground uppercase"
          >
            Volumes {project.data ? `· ${project.data.books.length}` : ""}
          </h2>
          {project.isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              This project could not be loaded.
            </p>
          ) : project.isPending ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
              ))}
            </div>
          ) : project.data.books.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {project.data.books.map((book) => (
                <ProjectVolume
                  key={book.id}
                  book={book}
                  deleting={remove.isPending}
                  onDelete={() => remove.mutate(book.id)}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              This project has no volumes.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
