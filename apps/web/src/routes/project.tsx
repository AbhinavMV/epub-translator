import type { ProjectDetail } from "@et/contracts";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Languages, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useProject, useProjectSettings, useRenameProject } from "@/api/queries";
import { AppHeader } from "@/components/app-header";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { GlossaryWarning } from "@/components/project/glossary-warning";
import { ProjectGlossaryPanel, ProjectPromptPanel } from "@/components/project/project-terms";
import { VolumeList } from "@/components/project/volume-list";
import { StatusLine } from "@/components/status-line";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UploadDialog,
  type UploadDialogController,
  usePageDrop,
  useUploadDialog,
} from "@/components/upload/upload-dialog";
import { useGlossarySkipped } from "@/lib/glossary-skip-store";
import { projectProgress, volumeProgress } from "@/lib/progress-status";
import { useRenameOfferDismissal } from "@/lib/rename-offer-store";
import { translatedProjectName } from "@/lib/translated-project-name";

const TABS = ["volumes", "glossary", "prompt"] as const;
export type ProjectTab = (typeof TABS)[number];

/** Volumes is the default tab, so it is left out of the URL. */
export function parseProjectTab(value: unknown): Exclude<ProjectTab, "volumes"> | undefined {
  return value === "glossary" || value === "prompt" ? value : undefined;
}

export interface ProjectSearch {
  tab?: Exclude<ProjectTab, "volumes">;
  /** Opens the Glossary tab's Suggest terms panel. */
  suggest?: true;
}

export function parseProjectSearch(search: Record<string, unknown>): ProjectSearch {
  const tab = parseProjectTab(search.tab);
  const suggest = tab === "glossary" && (search.suggest === true || search.suggest === "true");
  return { tab, suggest: suggest ? true : undefined };
}

const volumes = (n: number) => `${n} volume${n === 1 ? "" : "s"}`;

function RenameForm({
  project,
  initial,
  onDone,
}: {
  project: ProjectDetail;
  initial: string;
  onDone: () => void;
}) {
  const rename = useRenameProject(project.id);
  const [draft, setDraft] = useState(initial);
  const trimmed = draft.trim();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    rename.mutate(trimmed, {
      onSuccess: onDone,
      onError: () => toast.error("Could not rename the project"),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-wrap items-center gap-2">
      <Input
        aria-label="Project name"
        value={draft}
        maxLength={200}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
        className="min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto"
      />
      <Button type="submit" size="sm" disabled={!trimmed || rename.isPending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

function ProjectMenu({
  project,
  translatedName,
  onRename,
  upload,
}: {
  project: ProjectDetail;
  translatedName: string | null;
  onRename: (initial: string) => void;
  upload: UploadDialogController;
}) {
  const [deleting, setDeleting] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);
  const rename = (initial: string) => {
    afterClose.current = () => onRename(initial);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Project actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          className="w-60 max-w-(--radix-dropdown-menu-content-available-width)"
          onCloseAutoFocus={(e) => {
            const next = afterClose.current;
            afterClose.current = null;
            if (!next) return;
            e.preventDefault();
            next();
          }}
        >
          <DropdownMenuItem onSelect={() => rename(project.name)}>
            <Pencil /> Rename project
          </DropdownMenuItem>
          {translatedName ? (
            <DropdownMenuItem onSelect={() => rename(translatedName)}>
              <Languages /> Use translated title
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => upload.open()}>
            <Upload /> Upload volume
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteProjectDialog project={project} open={deleting} onOpenChange={setDeleting} />
    </>
  );
}

function RenameOffer({ project, name }: { project: ProjectDetail; name: string }) {
  const rename = useRenameProject(project.id);
  const offer = useRenameOfferDismissal(project.id, name);
  if (offer.dismissed) return null;
  return (
    <section
      aria-label="Rename offer"
      className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg bg-primary/10 px-3.5 py-3"
    >
      <Languages aria-hidden className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-[1_1_14rem] text-sm break-words">
        The volumes have a translated title: <b className="font-semibold">{name}</b>. Rename the
        project to match?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={offer.dismiss}>
          Not now
        </Button>
        <Button
          size="sm"
          disabled={rename.isPending}
          onClick={() =>
            rename.mutate(name, {
              onSuccess: () => toast.success(`Renamed the project to “${name}”`),
              onError: () => toast.error("Could not rename the project"),
            })
          }
        >
          Rename project
        </Button>
      </div>
    </section>
  );
}

function ProjectHead({
  project,
  upload,
}: {
  project: ProjectDetail;
  upload: UploadDialogController;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const suggested = translatedProjectName(project.books);
  const translatedName = suggested && suggested !== project.name ? suggested : null;
  const translatedCount = project.books.filter(
    (b) => volumeProgress(b, project.mainLang).done,
  ).length;
  const progress = projectProgress({
    volumeCount: project.books.length,
    translatedVolumeCount: translatedCount,
    fullyTranslatedLang: project.fullyTranslatedLang,
    mainLang: project.mainLang,
  });
  const eyebrow = [
    "Project",
    volumes(project.books.length),
    project.mainLang && !project.fullyTranslatedLang ? `${translatedCount} translated` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground tabular-nums">{eyebrow}</p>
          {draft === null ? (
            <h1 className="min-w-0 font-serif text-2xl font-medium tracking-tight break-words sm:text-3xl">
              {project.name}
            </h1>
          ) : (
            <RenameForm project={project} initial={draft} onDone={() => setDraft(null)} />
          )}
          {progress.done ? <StatusLine bar={false} className="mt-1" status={progress} /> : null}
        </div>
        <ProjectMenu
          project={project}
          translatedName={translatedName}
          onRename={setDraft}
          upload={upload}
        />
      </header>
      {translatedName && draft === null ? (
        <RenameOffer project={project} name={translatedName} />
      ) : null}
    </>
  );
}

export function ProjectPage() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const search = parseProjectSearch(useSearch({ strict: false }));
  const tab: ProjectTab = search.tab ?? "volumes";
  const navigate = useNavigate();
  const project = useProject(projectId);
  const settings = useProjectSettings(projectId);
  const upload = useUploadDialog();
  usePageDrop(upload);
  const glossarySkipped = useGlossarySkipped(projectId);
  const detail = project.data;
  const warnNoGlossary =
    tab !== "glossary" &&
    !glossarySkipped &&
    settings.data?.glossary.length === 0 &&
    detail !== undefined &&
    !detail.fullyTranslatedLang &&
    detail.books.some((b) => !volumeProgress(b, detail.mainLang).done);

  const selectTab = (value: string) =>
    void navigate({
      to: "/projects/$projectId",
      params: { projectId },
      search: { tab: parseProjectTab(value) },
    });

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        crumbs={[
          { kind: "library" },
          { kind: "current", label: project.data?.name ?? (project.isError ? "Project" : "…") },
        ]}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 pt-5 pb-24 sm:gap-6 sm:px-6 sm:pt-7">
        <UploadDialog upload={upload} projectId={projectId} />
        {project.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            This project could not be loaded.
          </p>
        ) : project.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-56 max-w-full" />
          </div>
        ) : (
          <>
            <ProjectHead project={project.data} upload={upload} />
            {warnNoGlossary ? (
              <GlossaryWarning
                projectId={projectId}
                onSuggest={() =>
                  void navigate({
                    to: "/projects/$projectId",
                    params: { projectId },
                    search: { tab: "glossary", suggest: true },
                  })
                }
              />
            ) : null}
            <Tabs value={tab} onValueChange={selectTab}>
              <TabsList aria-label="Project">
                <TabsTrigger value="volumes">
                  Volumes
                  <Count n={project.data.books.length} />
                </TabsTrigger>
                <TabsTrigger value="glossary">
                  Glossary
                  {settings.data ? <Count n={settings.data.glossary.length} /> : null}
                </TabsTrigger>
                <TabsTrigger value="prompt">Custom prompt</TabsTrigger>
              </TabsList>
              <TabsContent value="volumes" className="flex flex-col gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                  <p className="min-w-0 flex-[1_1_16rem] text-sm text-muted-foreground">
                    Volumes are ordered by volume number. The glossary and custom prompt apply to
                    all of them.
                  </p>
                  <Button variant="outline" onClick={() => upload.open()}>
                    <Upload aria-hidden />
                    Upload volume
                  </Button>
                </div>
                {project.data.books.length > 0 ? (
                  <VolumeList books={project.data.books} mainLang={project.data.mainLang} />
                ) : (
                  <p className="rounded-xl border-[1.5px] border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    This project has no volumes.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="glossary">
                <ProjectGlossaryPanel
                  projectId={projectId}
                  books={project.data.books}
                  suggest={search.suggest === true}
                />
              </TabsContent>
              <TabsContent value="prompt">
                <ProjectPromptPanel projectId={projectId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="font-mono text-xs text-muted-foreground tabular-nums">{n}</span>;
}
