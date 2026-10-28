import { ChevronDown, Loader2, SpellCheck, Square } from "lucide-react";
import { useState } from "react";
import type { ProofreadRunState } from "@/api/use-proofread-run";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ProofreadScope {
  chapterId: string | undefined;
  chapterTranslated: boolean;
  chapterProofread: boolean;
  unproofread: string[];
  translated: string[];
}

export function ProofreadMenu({
  scope,
  run,
  disabledHint,
  modelLabel,
  onStart,
  onStop,
}: {
  scope: ProofreadScope;
  run: ProofreadRunState;
  disabledHint: string | null;
  modelLabel: string;
  onStart: (chapterIds: string[]) => void;
  onStop: () => void;
}) {
  const [confirm, setConfirm] = useState<string[] | null>(null);

  if (run.running) {
    return (
      <Button variant="outline" size="sm" onClick={onStop} aria-label="Stop proofreading">
        <Loader2 className="animate-spin" />
        <span>
          Proofreading {Math.min(run.done + 1, run.total)}/{run.total}
        </span>
        <Square className="size-2.5 fill-current" />
      </Button>
    );
  }

  const trigger = (
    <Button variant="outline" size="sm" disabled={disabledHint !== null}>
      <SpellCheck />
      <span className="hidden sm:inline">Proofread</span>
      <ChevronDown className="opacity-60" />
    </Button>
  );

  if (disabledHint !== null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: disabled buttons cannot take focus; the tooltip needs a focusable wrapper */}
          <span tabIndex={0}>{trigger}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledHint}</TooltipContent>
      </Tooltip>
    );
  }

  const { chapterId } = scope;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            AI checks the translation against the original. You review every change.
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!chapterId || !scope.chapterTranslated}
            onSelect={() => chapterId && onStart([chapterId])}
          >
            {scope.chapterProofread ? "Proofread this chapter again" : "Proofread this chapter"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={scope.unproofread.length === 0}
            onSelect={() => setConfirm(scope.unproofread)}
          >
            Chapters not yet proofread ({scope.unproofread.length})
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={scope.translated.length === 0}
            onSelect={() => setConfirm(scope.translated)}
          >
            Whole book ({scope.translated.length})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Proofread {confirm?.length} chapter{confirm?.length === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              Each chapter&apos;s original and translation goes to {modelLabel}. That costs about as
              much input as translating those chapters again, with far less output. Chapters run one
              at a time and keep names consistent between them. Nothing changes until you accept a
              suggestion, and you can stop at any point.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirm) onStart(confirm);
                setConfirm(null);
              }}
            >
              Start proofreading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
