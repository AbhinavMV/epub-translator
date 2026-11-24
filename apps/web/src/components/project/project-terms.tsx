import type { BookSummary, GlossaryEntry, GlossaryRendering, ProjectTerms } from "@et/contracts";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useProjectSettings, useResolveGlossaryConflict, useSaveProjectTerms } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { GlossaryEditor } from "./glossary-editor";
import { ProjectGlossarySuggestions } from "./project-glossary-suggestions";
import { PromptEditor } from "./prompt-editor";

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
  suggest = false,
}: {
  projectId: string;
  books: BookSummary[];
  suggest?: boolean;
}) {
  const { data, saving, persist } = useProjectTerms(projectId);
  const resolveConflict = useResolveGlossaryConflict(projectId);
  const dirty = useRef(false);
  const onDirtyChange = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.current,
    enableBeforeUnload: () => dirty.current,
    withResolver: true,
  });

  const volumeLabel = (rendering: GlossaryRendering) => {
    if (rendering.volumeNumber !== null) return `Vol. ${rendering.volumeNumber}`;
    return books.find((b) => b.id === rendering.bookId)?.title ?? "Unnumbered volume";
  };

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const save = async (glossary: GlossaryEntry[], settled: string[]) => {
    // Saving drops a conflict only once its entry moves off the rendering in force, so a
    // conflict settled on that rendering has to be resolved explicitly.
    const keptInForce = data.glossaryConflicts.filter(
      (c) =>
        settled.includes(c.source) &&
        glossary.find((e) => e.source === c.source)?.target === c.inForce.target,
    );
    try {
      for (const c of keptInForce) {
        await resolveConflict.mutateAsync({ source: c.source, target: c.inForce.target });
      }
    } catch (error) {
      toast.error("Could not save the glossary");
      throw error;
    }
    await persist({ glossary }, "Could not save the glossary");
    toast.success("Glossary saved. It applies from the next chapter.");
  };

  return (
    <>
      <GlossaryEditor
        glossary={data.glossary}
        conflicts={data.glossaryConflicts}
        volumeLabel={volumeLabel}
        saving={saving || resolveConflict.isPending}
        onSave={save}
        onDirtyChange={onDirtyChange}
        initialSuggesting={suggest}
        suggestions={(add) => (
          <ProjectGlossarySuggestions books={books} onAdd={add} readAll={suggest} />
        )}
      />
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved glossary changes?</DialogTitle>
            <DialogDescription>
              You changed the glossary without saving. Leaving now discards those changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectPromptPanel({ projectId }: { projectId: string }) {
  const { data, saving, persist } = useProjectTerms(projectId);
  return (
    <PromptEditor
      value={data?.customPrompt}
      saving={saving}
      onSave={(customPrompt) => persist({ customPrompt }, "Could not save the custom prompt")}
    />
  );
}
