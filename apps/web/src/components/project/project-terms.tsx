import type { BookSummary, GlossaryRendering, ProjectTerms } from "@et/contracts";
import { toast } from "sonner";
import { useProjectSettings, useResolveGlossaryConflict, useSaveProjectTerms } from "@/api/queries";
import { GlossaryDialog } from "@/components/editor/glossary-dialog";
import { PromptDialog } from "@/components/editor/prompt-dialog";
import { ProjectGlossarySuggestions } from "./project-glossary-suggestions";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ProjectTermsSection({
  projectId,
  books,
}: {
  projectId: string;
  books: BookSummary[];
}) {
  const settings = useProjectSettings(projectId);
  const save = useSaveProjectTerms(projectId);
  const resolveConflict = useResolveGlossaryConflict(projectId);
  const data = settings.data;

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

  const persist = (patch: Partial<ProjectTerms>, failure: string) => {
    if (!data) return Promise.resolve();
    return save
      .mutateAsync({ customPrompt: data.customPrompt, glossary: data.glossary, ...patch })
      .catch((error: unknown) => {
        toast.error(failure);
        throw error;
      });
  };

  return (
    <section aria-labelledby="terms-heading" className="flex flex-col gap-3">
      <h2
        id="terms-heading"
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        Glossary and custom prompt
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <GlossaryDialog
          glossary={data?.glossary}
          saving={save.isPending}
          onSave={(glossary) => persist({ glossary }, "Could not save the glossary")}
          suggestions={(add) => <ProjectGlossarySuggestions books={books} onAdd={add} />}
          conflicts={
            data
              ? { conflicts: data.glossaryConflicts, volumeLabel, onResolve: resolve }
              : undefined
          }
        />
        <PromptDialog
          value={data?.customPrompt}
          disabled={!data}
          saving={save.isPending}
          onSave={(customPrompt) => persist({ customPrompt }, "Could not save the custom prompt")}
        />
        {data ? (
          <p className="text-sm text-muted-foreground">
            {count(data.glossary.length, "glossary entry", "glossary entries")}, used by every
            volume
            {data.glossaryConflicts.length > 0
              ? ` · ${count(data.glossaryConflicts.length, "glossary conflict", "glossary conflicts")} from merged volumes`
              : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
