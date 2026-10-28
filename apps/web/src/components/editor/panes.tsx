import type { ChapterBlock, ChapterView } from "@et/contracts";
import { ChevronDown, Copy, Eraser, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Html } from "@/components/html";
import { PartSentinel } from "@/components/part-sentinel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type LanguageAttrs, languageAttrs } from "@/lib/language-attrs";
import { chapterText, countChars, formatCount } from "@/lib/text";
import { cn } from "@/lib/utils";

type SegmentBlock = Extract<ChapterBlock, { kind: "segment" }>;

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not access the clipboard");
  }
}

function LangTag({ code }: { code: string }) {
  return (
    <span className="rounded-sm border px-1 py-px font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
      {code}
    </span>
  );
}

function TargetCell({
  block,
  busy,
  firstPending,
  language,
  onSuggestion,
}: {
  block: SegmentBlock;
  busy: boolean;
  firstPending: boolean;
  language: LanguageAttrs | undefined;
  onSuggestion: (() => void) | undefined;
}) {
  const flagged = block.status === "flagged";
  const pending = block.targetHtml === null;
  return (
    <div
      {...(pending && busy ? { "data-running": "" } : {})}
      data-flagged={flagged ? "" : undefined}
      title={flagged ? "Formatting couldn't be preserved" : undefined}
      className={cn(
        "min-w-0 px-5 py-3 lg:border-l",
        pending && "segment-pending",
        flagged && "segment-flagged",
      )}
    >
      {onSuggestion && (
        <button
          type="button"
          onClick={onSuggestion}
          className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          <Sparkles className="size-3" />
          Suggested edit
        </button>
      )}
      {block.targetHtml !== null ? (
        <Html html={block.targetHtml} language={language} />
      ) : busy ? (
        <div className="space-y-2 py-1.5" role="status" aria-label="Translating">
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ) : block.status === "failed" ? (
        <div className="text-sm text-destructive">
          <p>{block.note ?? "This passage could not be translated."}</p>
          <p className="text-destructive/75">
            Use Translate chapter again to retry only failed passages, or pick another model.
          </p>
        </div>
      ) : firstPending ? (
        <p className="text-sm text-muted-foreground italic">Translation will appear here…</p>
      ) : null}
    </div>
  );
}

export function EditorPanes({
  view,
  loading,
  busy,
  sourceLang,
  targetLang,
  hasTranslation,
  canRetry,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onRetry,
  onClear,
  suggested,
  onSuggestion,
}: {
  view: ChapterView | undefined;
  loading: boolean;
  busy: boolean;
  sourceLang: string;
  targetLang: string;
  hasTranslation: boolean;
  canRetry: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRetry: () => void;
  onClear: () => void;
  suggested?: ReadonlySet<string>;
  onSuggestion?: (segmentId: string) => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const targetLanguage = languageAttrs(targetLang);

  const stats = useMemo(() => {
    if (!view) return { source: "", target: "", sourceChars: 0, targetChars: 0 };
    const source = chapterText(view, "source");
    const target = chapterText(view, "target");
    return { source, target, sourceChars: countChars(source), targetChars: countChars(target) };
  }, [view]);

  const firstPendingId = view?.blocks.find(
    (b): b is SegmentBlock => b.kind === "segment" && b.targetHtml === null,
  )?.id;

  return (
    <div className="editor-text min-w-0">
      <div className="sticky top-0 z-10 grid grid-cols-1 border-b bg-card/90 backdrop-blur lg:grid-cols-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-2">
          <LangTag code={sourceLang} />
          <span className="text-sm font-medium">Source</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatCount(stats.sourceChars)} chars
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              aria-expanded={showSource}
              onClick={() => setShowSource((v) => !v)}
            >
              {showSource ? "Hide" : "Show"}
              <ChevronDown className={cn("transition-transform", showSource && "rotate-180")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!stats.source}
              onClick={() => copy(stats.source, "Source")}
            >
              <Copy /> Copy
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-5 py-2 lg:border-t-0 lg:border-l">
          <LangTag code={targetLang} />
          <span className="text-sm font-medium">Translation</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatCount(stats.targetChars)} chars
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={!canRetry} onClick={onRetry}>
              <RotateCcw /> <span className="hidden sm:inline">Retry</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!stats.target}
              onClick={() => copy(stats.target, "Translation")}
            >
              <Copy /> <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={!hasTranslation || busy} onClick={onClear}>
              <Eraser /> <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>
      </div>

      {!view && loading ? (
        <div className="space-y-4 px-5 py-6">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        view?.blocks.map((block, i) =>
          block.kind === "static" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: static blocks have no id and never reorder
            <div key={`static-${i}`} className="border-b border-border/50 px-5 py-3">
              <Html html={block.html} />
            </div>
          ) : (
            <div
              key={block.id}
              data-segment-id={block.id}
              className="grid scroll-mt-14 grid-cols-1 border-b border-border/50 transition-colors data-[flash]:bg-primary/10 lg:grid-cols-2"
            >
              <div
                className={cn(
                  "min-w-0 px-5 py-3 text-foreground/90",
                  !showSource && "hidden lg:block",
                )}
              >
                <Html html={block.sourceHtml} />
              </div>
              <TargetCell
                block={block}
                busy={busy}
                firstPending={block.id === firstPendingId}
                language={targetLanguage}
                onSuggestion={
                  suggested?.has(block.id) && onSuggestion
                    ? () => onSuggestion(block.id)
                    : undefined
                }
              />
            </div>
          ),
        )
      )}
      <PartSentinel hasMore={hasMore} loading={loadingMore} onVisible={() => onLoadMore?.()} />
    </div>
  );
}
