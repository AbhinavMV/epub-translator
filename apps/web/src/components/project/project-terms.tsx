import type { BookSummary, GlossaryRendering, ProjectTerms } from "@et/contracts";
import { toast } from "sonner";
import { useProjectSettings, useResolveGlossaryConflict, useSaveProjectTerms } from "@/api/queries";
import { GlossaryDialog } from "@/components/editor/glossary-dialog";
import { PromptDialog } from "@/components/editor/prompt-dialog";
import { ProjectGlossarySuggestions } from "./project-glossary-suggestions";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function useProjectTerms(projectId: string) {
  const settings = useProjectSettings(projectId);
  const save = useSaveProjectTerms(projectId);
  const data = settings.data;

  const persist = (patch: Partial<ProjectTerms>, failure: string) => {
    if (!data) return Promise.resolve();
    return save
      .mutateAsync({ customPrompt: data.customPrompt, glossary: data.glossary, ...patch })
      .catch((error: unknown) => {
        toast.error(failure);
        throw error;
      });
  };

  return { data, saving: save.isPending, persist };
}

export function ProjectGlossaryPanel({
  projectId,
  books,
}: {
  projectId: string;
  books: BookSummary[];
}) {
  const { data, saving, persist } = useProjectTerms(projectId);
  const resolveConflict = useResolveGlossaryConflict(projectId);

  const volumeLabel = (rendering: GlossaryRendering) => {
    if (rendering.volumeNumber !== null) return `Volume ${rendering.volumeNumber}`;
    return books.find((b) => b.id === rendering.bookId)?.title ?? "Unnumbered volume";
  };

  const resolve = (source: string, target: string) =>
    resolveConflict
      .mutateAsync({ source, target })
      .then((next) => next.glossary.find((e) => e.source === source))
      .catch((error: unknown) => {
        toast.error("Could not resolve the glossary conflict");
        throw error;
      });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Every volume of this project is translated with the same glossary, so names and terms stay
        the same throughout.
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <GlossaryDialog
          glossary={data?.glossary}
          saving={saving}
          onSave={(glossary) => persist({ glossary }, "Could not save the glossary")}
          suggestions={(add) => <ProjectGlossarySuggestions books={books} onAdd={add} />}
          conflicts={
            data
              ? { conflicts: data.glossaryConflicts, volumeLabel, onResolve: resolve }
              : undefined
          }
        />
        {data ? (
          <p className="min-w-0 text-sm text-muted-foreground">
            {count(data.glossary.length, "glossary entry", "glossary entries")}, used by every
            volume
            {data.glossaryConflicts.length > 0
              ? ` · ${count(data.glossaryConflicts.length, "glossary conflict", "glossary conflicts")} from merged volumes`
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectPromptPanel({ projectId }: { projectId: string }) {
  const { data, saving, persist } = useProjectTerms(projectId);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Style guidance sent with every translation request in this project, on top of the fixed
        rules.
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PromptDialog
          value={data?.customPrompt}
          disabled={!data}
          saving={saving}
          onSave={(customPrompt) => persist({ customPrompt }, "Could not save the custom prompt")}
        />
        {data ? (
          <p className="min-w-0 text-sm text-muted-foreground">
            {data.customPrompt ? "Custom prompt set" : "Using the default style guidance"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
