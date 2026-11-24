import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useApi } from "@/api/api-context";
import { keys } from "@/api/keys";
import { useProject, useProjectSettings } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { needsGlossaryFirst } from "@/lib/glossary-first";
import { glossarySkipStore } from "@/lib/glossary-skip-store";

/**
 * Holds a translation until the reader chooses Translate anyway or Set up glossary, when the
 * project page would warn about the empty glossary or the glossary cannot be loaded. Translate
 * anyway is remembered per project only for an empty glossary, not for one that failed to load.
 */
export function useGlossaryFirst(projectId: string | null | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useProject(projectId);
  useProjectSettings(projectId ?? undefined);
  const [held, setHeld] = useState<{ run: () => void; unreadable: boolean } | null>(null);

  const guard = async (run: () => void) => {
    if (!projectId || glossarySkipStore.isSkipped(projectId)) return run();
    let ask: boolean;
    try {
      const [settings, detail] = await Promise.all([
        queryClient.ensureQueryData({
          queryKey: keys.projectSettings(projectId),
          queryFn: () => api.getProjectSettings(projectId),
        }),
        queryClient.ensureQueryData({
          queryKey: keys.project(projectId),
          queryFn: () => api.getProject(projectId),
        }),
      ]);
      ask = needsGlossaryFirst(
        detail,
        settings.glossary.length,
        glossarySkipStore.isSkipped(projectId),
      );
    } catch {
      setHeld({ run, unreadable: true });
      return;
    }
    if (ask) setHeld({ run, unreadable: false });
    else run();
  };

  const dialog = (
    <Dialog
      open={held !== null}
      onOpenChange={(open) => {
        if (!open) setHeld(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Translate without a glossary?</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {held?.unreadable
              ? `The glossary for ${project.data?.name ?? "this project"} could not be loaded, so its entries may not be used.`
              : `${project.data?.name ?? "This project"} has no glossary yet.`}{" "}
            Names and recurring terms may be translated differently in each chapter, and fixing them
            later means retranslating or proofreading.
          </DialogDescription>
          <p className="text-sm text-muted-foreground">
            Suggest terms reads a sample of the text and proposes entries for you to review. It
            takes about a minute.
          </p>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setHeld(null);
              if (projectId && held && !held.unreadable) glossarySkipStore.skip(projectId);
              held?.run();
            }}
          >
            Translate anyway
          </Button>
          <Button
            onClick={() => {
              setHeld(null);
              if (!projectId) return;
              void navigate({
                to: "/projects/$projectId",
                params: { projectId },
                search: { tab: "glossary", suggest: true },
              });
            }}
          >
            <Sparkles aria-hidden />
            Set up glossary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { guard, dialog };
}
