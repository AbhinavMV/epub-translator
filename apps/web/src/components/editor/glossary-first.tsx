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
import { glossarySkipStore } from "@/lib/glossary-skip-store";

/**
 * Holds every translation the editor starts in a project with no glossary until the reader
 * chooses Translate anyway (remembered per project on this device) or Set up glossary.
 */
export function useGlossaryFirst(projectId: string | null | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const project = useProject(projectId);
  useProjectSettings(projectId ?? undefined);
  const [held, setHeld] = useState<{ run: () => void } | null>(null);

  const guard = async (run: () => void) => {
    if (!projectId || glossarySkipStore.isSkipped(projectId)) return run();
    let glossarySize: number;
    try {
      const settings = await queryClient.ensureQueryData({
        queryKey: keys.projectSettings(projectId),
        queryFn: () => api.getProjectSettings(projectId),
      });
      glossarySize = settings.glossary.length;
    } catch {
      // A glossary we cannot read should not stop the reader from translating.
      return run();
    }
    if (glossarySize > 0 || glossarySkipStore.isSkipped(projectId)) return run();
    setHeld({ run });
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
            {project.data?.name ?? "This project"} has no glossary yet. Names and recurring terms
            may be translated differently in each chapter, and fixing them later means retranslating
            or proofreading.
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
              const run = held?.run;
              setHeld(null);
              if (projectId) glossarySkipStore.skip(projectId);
              run?.();
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
