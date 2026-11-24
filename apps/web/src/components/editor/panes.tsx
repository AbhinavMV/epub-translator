import type { ChapterBlock, ChapterView } from "@et/contracts";
import { Copy, Eraser, RotateCcw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Html } from "@/components/html";
import { PartSentinel } from "@/components/part-sentinel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type LanguageAttrs, languageAttrs } from "@/lib/language-attrs";
import { chapterText, countChars, formatCount } from "@/lib/text";
import { cn } from "@/lib/utils";
import type { EditorView } from "./view-switch";

type SegmentBlock = Extract<ChapterBlock, { kind: "segment" }>;

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not access the clipboard");
  }
}

function LangTag({ code }: { code: string }) {
  return (
    <span className="rounded-sm border px-1 py-px font-mono text-xs tracking-wider text-muted-foreground uppercase">
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
  retry,
  phoneHidden,
}: {
  block: SegmentBlock;
  phoneHidden: boolean;
  busy: boolean;
  firstPending: boolean;
  language: LanguageAttrs | undefined;
  onSuggestion: (() => void) | undefined;
  retry: { label: string; disabled: boolean; onClick: () => void };
}) {
  const flagged = block.status === "flagged";
  const pending = block.targetHtml === null;
  return (
    <div
      {...(pending && busy ? { "data-running": "" } : {})}
      data-flagged={flagged ? "" : undefined}
      title={flagged ? "Formatting couldn't be preserved" : undefined}
      className={cn(
        "min-w-0 px-5 py-3 max-sm:px-4 sm:border-l",
        phoneHidden && "max-sm:hidden",
        block.status === "failed" && !busy && "bg-destructive/5",
        pending && "segment-pending",
        flagged && "segment-flagged",
      )}
    >
      {onSuggestion && (
        <button
          type="button"
          onClick={onSuggestion}
          className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-flag/15 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-flag/25"
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
        <div className="space-y-2 font-sans text-sm">
          <p>
            <span className="font-semibold text-destructive">Not translated.</span>{" "}
            {block.note ?? "This passage could not be translated."}
          </p>
          <Button variant="outline" size="sm" disabled={retry.disabled} onClick={retry.onClick}>
            <RotateCcw />
            {retry.label}
          </Button>
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
  failedCount,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onRetryFailed,
  onClear,
  suggested,
  onSuggestion,
  phoneView = "both",
}: {
  view: ChapterView | undefined;
  /** Which side shows below 640 px; from 640 px both sit side by side. */
  phoneView?: EditorView;
  loading: boolean;
  busy: boolean;
  sourceLang: string;
  targetLang: string;
  hasTranslation: boolean;
  canRetry: boolean;
  /** Failed passages in the whole chapter; defaults to those loaded so far. */
  failedCount?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onRetryFailed: () => void;
  onClear: () => void;
  suggested?: ReadonlySet<string>;
  onSuggestion?: (segmentId: string) => void;
}) {
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
  const failed =
    failedCount ??
    view?.blocks.filter((b) => b.kind === "segment" && b.status === "failed").length ??
    0;
  const retry = {
    label: failed > 1 ? `Retry ${failed} failed` : "Retry passage",
    disabled: !canRetry || busy,
    onClick: onRetryFailed,
  };

  return (
    <div className="editor-text min-w-0" data-phone-view={phoneView}>
      <div className="sticky top-0 z-10 grid grid-cols-1 border-b bg-card/90 backdrop-blur max-sm:hidden sm:grid-cols-2">
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
              disabled={!stats.source}
              onClick={() => copyText(stats.source, "Source")}
            >
              <Copy /> Copy
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-5 py-2 sm:border-t-0 sm:border-l">
          <LangTag code={targetLang} />
          <span className="text-sm font-medium">Translation</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatCount(stats.targetChars)} chars
          </span>
          <div className="ml-auto flex items-center gap-1">
            {stats.target ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Copy translation"
                onClick={() => copyText(stats.target, "Translation")}
              >
                <Copy /> <span className="max-lg:hidden">Copy</span>
              </Button>
            ) : null}
            {hasTranslation ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear translation"
                disabled={busy}
                onClick={onClear}
              >
                <Eraser /> <span className="max-lg:hidden">Clear</span>
              </Button>
            ) : null}
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
              className="grid scroll-mt-14 grid-cols-1 border-b border-border/50 transition-colors data-[flash]:bg-primary/10 sm:grid-cols-2"
            >
              <div
                className={cn(
                  "min-w-0 px-5 py-3 text-foreground/90 max-sm:px-4",
                  phoneView === "translation" && "max-sm:hidden",
                  phoneView === "both" && "max-sm:pb-1 max-sm:text-muted-foreground",
                )}
              >
                <Html html={block.sourceHtml} />
              </div>
              <TargetCell
                phoneHidden={phoneView === "source"}
                block={block}
                busy={busy}
                firstPending={block.id === firstPendingId}
                language={targetLanguage}
                retry={retry}
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
