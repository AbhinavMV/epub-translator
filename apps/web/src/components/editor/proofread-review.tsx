import type {
  ChapterProofread,
  ProofreadDecisionBody,
  ProofreadKind,
  ProofreadSuggestion,
} from "@et/contracts";
import { stripTokens } from "@et/core";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { wordDiff } from "@/lib/word-diff";

const KIND_LABEL: Record<ProofreadKind, string> = {
  accuracy: "Accuracy",
  consistency: "Consistency",
  terminology: "Terminology",
  fluency: "Fluency",
  other: "Other",
};

const KIND_STYLE: Record<ProofreadKind, string> = {
  accuracy: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  consistency: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  terminology: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  fluency: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  other: "bg-secondary text-secondary-foreground",
};

const STATE_LABEL = {
  accepted: "Accepted",
  rejected: "Rejected",
  outdated: "Not applied: the paragraph changed since proofreading",
} as const;

function Diff({ before, after }: { before: string; after: string }) {
  let offset = 0;
  const parts = wordDiff(stripTokens(before), stripTokens(after)).map((part) => {
    const key = `${part.kind}-${offset}`;
    offset += part.text.length;
    return { ...part, key };
  });
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((part) =>
        part.kind === "same" ? (
          <span key={part.key}>{part.text}</span>
        ) : part.kind === "removed" ? (
          <del key={part.key} className="rounded-sm bg-red-500/15 text-red-800 dark:text-red-300">
            {part.text}
          </del>
        ) : (
          <ins
            key={part.key}
            className="rounded-sm bg-emerald-500/20 text-emerald-900 no-underline dark:text-emerald-200"
          >
            {part.text}
          </ins>
        ),
      )}
    </p>
  );
}

function SuggestionCard({
  suggestion,
  position,
  busy,
  onDecide,
  onJump,
}: {
  suggestion: ProofreadSuggestion;
  position: number | undefined;
  busy: boolean;
  onDecide: (decision: ProofreadDecisionBody) => void;
  onJump: (segmentId: string) => void;
}) {
  const pending = suggestion.state === "pending";
  return (
    <li
      data-suggestion={suggestion.segmentId}
      className={cn("space-y-2 rounded-lg border p-3", !pending && "bg-muted/40 opacity-75")}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("rounded-full px-2 py-0.5 font-medium", KIND_STYLE[suggestion.kind])}>
          {KIND_LABEL[suggestion.kind]}
        </span>
        <button
          type="button"
          onClick={() => onJump(suggestion.segmentId)}
          className="font-mono text-muted-foreground underline-offset-2 hover:underline"
        >
          {position !== undefined ? `¶ ${position}` : "Show paragraph"}
        </button>
        {suggestion.state !== "pending" && (
          <span className="ml-auto text-muted-foreground">{STATE_LABEL[suggestion.state]}</span>
        )}
      </div>
      <Diff before={suggestion.before} after={suggestion.after} />
      {suggestion.reason && (
        <p className="text-xs leading-snug text-muted-foreground">{suggestion.reason}</p>
      )}
      {pending && (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDecide({ reject: [suggestion.segmentId] })}
          >
            <X />
            Reject
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onDecide({ accept: [suggestion.segmentId] })}
          >
            <Check />
            Accept
          </Button>
        </div>
      )}
    </li>
  );
}

export function ProofreadBar({
  proofread,
  onOpen,
}: {
  proofread: ChapterProofread | null | undefined;
  onOpen: () => void;
}) {
  if (!proofread) return null;
  const pending = proofread.suggestions.filter((s) => s.state === "pending").length;
  const total = proofread.suggestions.length;
  return (
    <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-1.5 text-sm md:px-4">
      <Sparkles className="size-4 text-primary" />
      <span className="text-foreground/90">
        {total === 0
          ? "Proofread: no changes suggested for this chapter."
          : pending > 0
            ? `${pending} proofreading suggestion${pending === 1 ? "" : "s"} to review`
            : `Proofread: all ${total} suggestion${total === 1 ? "" : "s"} reviewed`}
      </span>
      {total > 0 && (
        <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={onOpen}>
          {pending > 0 ? "Review" : "Show"}
        </Button>
      )}
    </div>
  );
}

export function ProofreadSheet({
  open,
  onOpenChange,
  proofread,
  chapterTitle,
  positions,
  busy,
  onDecide,
  onDiscard,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proofread: ChapterProofread | null | undefined;
  chapterTitle: string;
  positions: ReadonlyMap<string, number>;
  busy: boolean;
  onDecide: (decision: ProofreadDecisionBody) => void;
  onDiscard: () => void;
  onJump: (segmentId: string) => void;
}) {
  const suggestions = proofread?.suggestions ?? [];
  const pending = suggestions.filter((s) => s.state === "pending").map((s) => s.segmentId);
  const decided = suggestions.filter((s) => s.state !== "pending");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Proofreading suggestions</SheetTitle>
          <SheetDescription>
            {chapterTitle}
            {proofread ? ` · ${proofread.model}` : ""}
          </SheetDescription>
          {pending.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" disabled={busy} onClick={() => onDecide({ accept: pending })}>
                <Check />
                Accept all ({pending.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onDecide({ reject: pending })}
              >
                Reject all
              </Button>
            </div>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes were suggested.</p>
          ) : (
            <ul className="space-y-3">
              {[...suggestions.filter((s) => s.state === "pending"), ...decided].map((s) => (
                <SuggestionCard
                  key={s.segmentId}
                  suggestion={s}
                  position={positions.get(s.segmentId)}
                  busy={busy}
                  onDecide={onDecide}
                  onJump={onJump}
                />
              ))}
            </ul>
          )}
        </div>
        <SheetFooter className="border-t">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
            Clear proofreading results
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
