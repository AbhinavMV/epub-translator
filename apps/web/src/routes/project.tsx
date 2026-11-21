import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useDeleteBook, useProject, useRenameProject } from "@/api/queries";
import { UserMenu } from "@/auth/user-menu";
import { AppMark } from "@/components/app-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectVolume } from "@/components/volume-number-editor";

function ProjectName({ projectId, name }: { projectId: string; name: string }) {
  const rename = useRenameProject(projectId);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate font-serif text-xl font-semibold">{name}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rename project"
          onClick={() => setDraft(name)}
        >
          <Pencil />
        </Button>
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
    <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        aria-label="Project name"
        value={draft}
        maxLength={200}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDraft(null);
        }}
        className="max-w-md"
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

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center gap-3">
        <AppMark />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            to="/"
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" /> Library
          </Link>
          {project.data ? (
            <ProjectName projectId={projectId} name={project.data.name} />
          ) : (
            <Skeleton className="h-7 w-48" />
          )}
        </div>
        <ThemeToggle />
        <UserMenu />
      </header>

      <section aria-labelledby="volumes-heading" className="flex flex-col gap-4">
        <h2
          id="volumes-heading"
          className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
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
            This project has no books.
          </p>
        )}
      </section>
    </div>
  );
}
