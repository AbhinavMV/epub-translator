import {
  type BookSettings,
  CONTENTS_CHAPTER_ID,
  type GlossaryEntry,
  type TranslateMode,
} from "@et/contracts";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/api-context";
import {
  useBook,
  useChapter,
  useJob,
  useJobAction,
  useProviders,
  useSaveSettings,
  useWorkspace,
} from "@/api/queries";
import { useJobEvents } from "@/api/use-job-events";
import { ChapterRail } from "@/components/chapter-rail";
import { EditorHeader } from "@/components/editor/editor-header";
import { resolveSelection, type Selection } from "@/components/editor/model-selection";
import { EditorPanes } from "@/components/editor/panes";
import { EditorToolbar } from "@/components/editor/toolbar";
import { TranslationError } from "@/components/editor/translation-error";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHosted } from "@/keys/hosted-context";
import {
  hasAnyTranslation,
  isBusy,
  progressFor,
  translatedChapterCount,
} from "@/lib/chapter-status";
import { effectiveMode, loadMode, saveMode } from "@/lib/translate-mode";
import { useBatchPolling, useHostedSync } from "@/translate/use-hosted-sync";

const route = getRouteApi("/books/$bookId");

export function BookPage() {
  const { bookId } = route.useParams();
  const search = route.useSearch();
  const navigate = useNavigate();
  const api = useApi();

  const book = useBook(bookId);
  const providers = useProviders();
  const [targetLang, setTargetLang] = useState("en");
  const workspace = useWorkspace(bookId, targetLang);
  const jobId = workspace.data?.id;
  const job = useJob(jobId);
  useJobEvents(jobId);
  const hosted = useHosted();
  useHostedSync(hosted, jobId);

  const chapters = book.data?.chapters ?? [];
  const chapterId = chapters.find((c) => c.id === search.chapter)?.id ?? chapters[0]?.id;
  const chapterIndex = chapters.findIndex((c) => c.id === chapterId);
  const chapter = useChapter(bookId, chapterId, jobId);
  const chapterProgress = progressFor(job.data, chapterId ?? "");
  const busy = isBusy(chapterProgress?.status);

  const settings = book.data?.settings;
  const selection = resolveSelection(settings, providers.data);
  const [mode, setMode] = useState<TranslateMode>(() => loadMode(window.localStorage));
  const batchAvailable =
    providers.data?.find((p) => p.id === selection?.provider)?.supportsBatch ?? false;
  const body = selection ? { ...selection, mode: effectiveMode(mode, batchAvailable) } : null;
  const onMode = (next: TranslateMode) => {
    setMode(next);
    saveMode(window.localStorage, next);
  };
  const saveSettings = useSaveSettings(bookId);
  const action = useJobAction(jobId);

  const [railOpen, setRailOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll when the chapter changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [chapterId]);

  const goTo = (id: string | undefined) => {
    if (!id) return;
    setRailOpen(false);
    void navigate({ to: "/books/$bookId", params: { bookId }, search: { chapter: id } });
  };

  const persist = (patch: Partial<BookSettings>) =>
    settings ? saveSettings.mutateAsync({ ...settings, ...patch }) : Promise.resolve();

  const onSelection = (next: Selection) =>
    void persist({ provider: next.provider, model: next.model });

  const hasSubmitted = job.data?.progress.some((p) => p.status === "submitted") ?? false;
  const checkBatch = useBatchPolling(hosted, jobId, hasSubmitted);

  const busyElsewhere =
    job.data?.progress.filter((p) => p.chapterId !== chapterId && isBusy(p.status)).length ?? 0;

  const noProviderHint = hosted
    ? "No AI key yet. Add one under AI keys."
    : "No provider configured. Set ANTHROPIC_API_KEY in apps/api/.env";

  if (book.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        This book could not be loaded.
      </div>
    );
  }

  const rail = (
    <ChapterRail chapters={chapters} job={job.data} activeId={chapterId} onSelect={goTo} />
  );

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader
        bookId={bookId}
        title={book.data?.title}
        translatedTitle={job.data?.titles.book}
        chapterId={chapterId}
        jobId={jobId}
        providers={providers.data}
        selection={selection}
        onSelection={onSelection}
        mode={effectiveMode(mode, batchAvailable)}
        batchAvailable={batchAvailable}
        onMode={onMode}
        targetLang={targetLang}
        onTargetLang={setTargetLang}
        settings={settings}
        saving={saveSettings.isPending}
        onSaveGlossary={(glossary: GlossaryEntry[]) => persist({ glossary })}
        onSavePrompt={(customPrompt) => persist({ customPrompt })}
        onOpenRail={() => setRailOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r bg-card/40 md:flex">
          <h2 className="px-5 pt-4 pb-1 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Chapters
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">{rail}</div>
        </aside>
        <Sheet open={railOpen} onOpenChange={setRailOpen}>
          <SheetContent side="left" className="w-80 gap-0 p-0">
            <SheetHeader>
              <SheetTitle>Chapters</SheetTitle>
              <SheetDescription className="sr-only">Choose a chapter</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{rail}</div>
          </SheetContent>
        </Sheet>
        <main className="flex min-w-0 flex-1 flex-col">
          <EditorToolbar
            chapterProgress={chapterProgress}
            busyCount={busyElsewhere}
            translatedChapters={translatedChapterCount(job.data)}
            totalChapters={chapters.length}
            canTranslate={Boolean(selection && jobId && chapterId)}
            noProviderHint={noProviderHint}
            starting={action.isPending && action.variables?.kind !== "clear"}
            hasPrev={chapterIndex > 0}
            hasNext={chapterIndex >= 0 && chapterIndex < chapters.length - 1}
            hasTranslation={hasAnyTranslation(job.data)}
            onTranslate={() =>
              body && chapterId && action.mutate({ kind: "translate", chapterId, body })
            }
            onTranslateAll={() => body && action.mutate({ kind: "translate-all", body })}
            onTranslateTitles={() =>
              body && action.mutate({ kind: "translate", chapterId: CONTENTS_CHAPTER_ID, body })
            }
            titlesBusy={isBusy(progressFor(job.data, CONTENTS_CHAPTER_ID)?.status)}
            onPrev={() => goTo(chapters[chapterIndex - 1]?.id)}
            onNext={() => goTo(chapters[chapterIndex + 1]?.id)}
            onCancel={() => action.mutate({ kind: "cancel" })}
            {...(hosted ? { onCheckBatch: checkBatch } : {})}
            epubHref={jobId ? api.exportUrl(jobId, "epub") : undefined}
            bilingualEpubHref={jobId ? api.exportUrl(jobId, "epub", "bilingual") : undefined}
            txtHref={jobId ? api.exportUrl(jobId, "txt") : undefined}
            onExport={
              api.signedExports
                ? (href) => {
                    api.openExport(href).catch(() => toast.error("Could not prepare the export"));
                  }
                : undefined
            }
          />
          <TranslationError chapterError={chapterProgress?.error} jobError={job.data?.error} />
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-background">
            <EditorPanes
              view={chapter.data}
              loading={chapter.isPending || book.isPending || workspace.isPending}
              busy={busy}
              sourceLang={(book.data?.sourceLang ?? "src").slice(0, 2)}
              targetLang={targetLang}
              hasTranslation={(chapterProgress?.done ?? 0) > 0}
              hasMore={chapter.hasMore}
              loadingMore={chapter.loadingMore}
              onLoadMore={chapter.loadMore}
              canRetry={Boolean(
                selection && chapterId && (chapterProgress?.done ?? 0) > 0 && !busy,
              )}
              onRetry={() => body && chapterId && action.mutate({ kind: "retry", chapterId, body })}
              onClear={() => chapterId && action.mutate({ kind: "clear", chapterId })}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
