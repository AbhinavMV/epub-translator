import type { BookSummary, ProjectSummary } from "@et/contracts";
import { parseVolumeTitle } from "@et/core";
import { BookOpen, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useBooks, useProjects } from "@/api/queries";
import { AppHeader } from "@/components/app-header";
import { ContinueStrip } from "@/components/continue-strip";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UploadDialog,
  UploadPrivacy,
  usePageDrop,
  useUploadDialog,
} from "@/components/upload/upload-dialog";

const GRID = "grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-5";

function seriesTitles(books: readonly BookSummary[] | undefined): Map<string, string[]> {
  const byProject = new Map<string, string[]>();
  for (const book of books ?? []) {
    if (!book.projectId) continue;
    const series = parseVolumeTitle(book.title).seriesTitle || book.title;
    byProject.set(book.projectId, [...(byProject.get(book.projectId) ?? []), series]);
  }
  return byProject;
}

function matches(project: ProjectSummary, query: string, series: Map<string, string[]>) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return [project.name, ...(series.get(project.id) ?? [])].some((text) =>
    text.toLocaleLowerCase().includes(q),
  );
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function LibraryPage() {
  const projects = useProjects();
  const upload = useUploadDialog();
  usePageDrop(upload);
  const [query, setQuery] = useState("");
  const books = useBooks({ enabled: query.trim() !== "" });
  const series = useMemo(() => seriesTitles(books.data), [books.data]);

  const all = projects.data ?? [];
  const shown = all.filter((p) => matches(p, query, series));
  const empty = projects.isSuccess && all.length === 0;
  const volumeCount = all.reduce((n, p) => n + p.volumeCount, 0);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader crumbs={[{ kind: "current", label: "Library" }]} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-5 pb-24 sm:px-6 sm:pt-7 sm:gap-7">
        <UploadDialog upload={upload} />
        {empty ? (
          <EmptyLibrary onUpload={() => upload.open()} />
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto]">
              <div className="min-w-0">
                {projects.data && (
                  <p className="text-xs font-medium text-muted-foreground tabular-nums">
                    {count(all.length, "project")} · {count(volumeCount, "volume")}
                  </p>
                )}
                <h1 className="font-serif text-2xl font-medium tracking-tight sm:text-3xl">
                  Library
                </h1>
              </div>
              <div className="relative order-last col-span-2 min-w-0 lg:order-none lg:col-span-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  aria-label="Search projects"
                  placeholder="Search projects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button aria-label="Upload EPUB" onClick={() => upload.open()}>
                <Upload aria-hidden />
                Upload<span className="hidden sm:inline">EPUB</span>
              </Button>
            </div>

            <ContinueStrip />

            {projects.isPending ? (
              <div className={GRID}>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
                ))}
              </div>
            ) : shown.length > 0 ? (
              <ul className={GRID} aria-label="Projects">
                {shown.map((project) => (
                  <li key={project.id} className="min-w-0">
                    <ProjectCard project={project} />
                  </li>
                ))}
              </ul>
            ) : all.length > 0 ? (
              <p className="text-sm text-muted-foreground">No project matches that search.</p>
            ) : null}

            <div className="hidden items-center gap-3.5 rounded-xl border-[1.5px] border-dashed px-5 py-5 text-muted-foreground sm:flex coarse:hidden">
              <Upload aria-hidden className="size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Drop an EPUB file anywhere on this page, or{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => upload.open()}
                  >
                    choose one
                  </button>
                  .
                </p>
                <p className="text-xs">
                  Each one is added as a volume; you choose the project before it uploads.
                </p>
                <UploadPrivacy />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyLibrary({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed px-4 py-16 text-center">
      <BookOpen aria-hidden className="size-8 text-primary" />
      <h1 className="font-serif text-2xl font-medium">Your library is empty</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Upload an EPUB to start a project. Every volume of a series goes in the same project, so
        they share one glossary.
      </p>
      <Button onClick={onUpload}>
        <Upload aria-hidden />
        Upload EPUB
      </Button>
      <UploadPrivacy />
    </div>
  );
}
