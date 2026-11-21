import type { BookSummary, ProjectTerms } from "@et/contracts";
import { toast } from "sonner";
import { useProjectSettings, useSaveProjectTerms } from "@/api/queries";
import { GlossaryDialog } from "@/components/editor/glossary-dialog";
import { PromptDialog } from "@/components/editor/prompt-dialog";
import { ProjectGlossarySuggestions } from "./project-glossary-suggestions";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ProjectTermsSection({
  projectId,
  books,
}: {
  projectId: string;
  books: BookSummary[];
}) {
  const settings = useProjectSettings(projectId);
  const save = useSaveProjectTerms(projectId);
  const data = settings.data;

  const persist = (patch: Partial<ProjectTerms>) => {
    if (!data) return Promise.resolve();
    return save
      .mutateAsync({ customPrompt: data.customPrompt, glossary: data.glossary, ...patch })
      .catch((error: unknown) => {
        toast.error("Could not save the project's glossary and prompt");
        throw error;
      });
  };

  return (
    <section aria-labelledby="terms-heading" className="flex flex-col gap-3">
      <h2
        id="terms-heading"
        className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase"
      >
        Glossary and prompt
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <GlossaryDialog
          glossary={data?.glossary}
          saving={save.isPending}
          onSave={(glossary) => persist({ glossary })}
          suggestions={(add) => <ProjectGlossarySuggestions books={books} onAdd={add} />}
        />
        <PromptDialog
          value={data?.customPrompt}
          disabled={!data}
          saving={save.isPending}
          onSave={(customPrompt) => persist({ customPrompt })}
        />
        {data ? (
          <p className="text-sm text-muted-foreground">
            {plural(data.glossary.length, "term")}, used by every volume
            {data.glossaryConflicts.length > 0
              ? ` · ${plural(data.glossaryConflicts.length, "conflict")} from merged volumes`
              : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
