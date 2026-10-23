import type { ChapterBlock, ChapterView } from "@et/contracts";
import { Html } from "@/components/html";
import type { ViewMode } from "@/lib/reader-settings-store";
import { cn } from "@/lib/utils";

type SegmentBlock = Extract<ChapterBlock, { kind: "segment" }>;

const FLAGGED_HINT = "Formatting couldn't be preserved";

function stateAttrs(block: SegmentBlock, running: boolean) {
  return {
    "data-pending": block.targetHtml === null ? "" : undefined,
    "data-flagged": block.status === "flagged" ? "" : undefined,
    "data-running": block.targetHtml === null && running ? "" : undefined,
    title: block.status === "flagged" ? FLAGGED_HINT : undefined,
  };
}

function rowClass(block: SegmentBlock) {
  return cn(
    "segment",
    block.targetHtml === null && "segment-pending",
    block.status === "flagged" && "segment-flagged",
  );
}

function firstParagraphId(view: ChapterView): string | null {
  for (const b of view.blocks) {
    if (b.kind === "segment" && /^\s*<p[\s>]/i.test(b.sourceHtml)) return b.id;
  }
  return null;
}

function Pending({ running }: { running: boolean }) {
  return running ? (
    <span className="mt-1 mb-3 block font-mono text-[0.7em] tracking-wide text-muted-foreground uppercase">
      translating…
    </span>
  ) : null;
}

export function ChapterContent({
  view,
  mode,
  running,
}: {
  view: ChapterView;
  mode: ViewMode;
  running: boolean;
}) {
  const dropId = firstParagraphId(view);

  if (mode === "side-by-side") {
    return (
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
        {view.blocks.map((block, i) =>
          block.kind === "static" ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static blocks have no id and never reorder
              key={`static-${i}`}
              data-testid="static-block"
              data-span="both"
              className="col-span-full"
            >
              <Html html={block.html} />
            </div>
          ) : (
            <div
              key={block.id}
              data-testid="segment-row"
              className={cn("contents", rowClass(block))}
            >
              <div className="border-b border-border/60 py-2 text-muted-foreground lg:border-b-0">
                <Html html={block.sourceHtml} />
              </div>
              <div
                {...stateAttrs(block, running)}
                className={cn("border-b border-border/60 py-2", rowClass(block))}
              >
                <Html
                  html={block.targetHtml ?? block.sourceHtml}
                  className={block.targetHtml === null ? "opacity-50" : ""}
                />
                {block.targetHtml === null && <Pending running={running} />}
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <div className={cn(mode === "translation" && "dropcap-root")}>
      {view.blocks.map((block, i) => {
        if (block.kind === "static") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static blocks have no id and never reorder
            <div key={`static-${i}`} data-testid="static-block" data-span="both">
              <Html html={block.html} />
            </div>
          );
        }
        if (mode === "interleaved") {
          return (
            <div
              key={block.id}
              data-testid="segment-row"
              {...stateAttrs(block, running)}
              className={cn("mb-3", rowClass(block))}
            >
              <Html html={block.sourceHtml} className="text-[0.82em] text-muted-foreground" />
              {block.targetHtml !== null ? (
                <Html html={block.targetHtml} />
              ) : (
                <Pending running={running} />
              )}
            </div>
          );
        }
        return (
          <div
            key={block.id}
            data-testid="segment-row"
            {...stateAttrs(block, running)}
            className={cn(
              rowClass(block),
              block.id === dropId && block.targetHtml !== null && "dropcap",
            )}
          >
            <Html
              html={block.targetHtml ?? block.sourceHtml}
              className={block.targetHtml === null ? "opacity-50" : ""}
            />
            {block.targetHtml === null && <Pending running={running} />}
          </div>
        );
      })}
    </div>
  );
}
