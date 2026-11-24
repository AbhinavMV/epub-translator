import { type BookSettings, CONTENTS_CHAPTER_ID, type TranslateMode } from "@et/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/api/api-context";
import {
  useBook,
  useChapter,
  useDiscardProofread,
  useJob,
  useJobAction,
  useProofread,
  useProofreadDecision,
  useProofreads,
  useProviders,
  useSaveSettings,
  useWorkspace,
} from "@/api/queries";
import { useJobEvents } from "@/api/use-job-events";
import { useProofreadRun } from "@/api/use-proofread-run";
import { volumeLabel } from "@/components/app-header";
import { ChapterRailPanel, ChapterSheet } from "@/components/chapter-rail";
import { ChapterPager } from "@/components/editor/chapter-pager";
import { ChapterStatusBlock } from "@/components/editor/chapter-status-block";
import { EditorHeader } from "@/components/editor/editor-header";
import { ExportMenu } from "@/components/editor/export-menu";
import { useGlossaryFirst } from "@/components/editor/glossary-first";
import { resolveSelection, type Selection } from "@/components/editor/model-selection";
import { ModelSheet } from "@/components/editor/model-sheet";
import { MORE_ITEM, MoreSheet } from "@/components/editor/more-sheet";
import { copyText, EditorPanes } from "@/components/editor/panes";
import { PhoneBar } from "@/components/editor/phone-bar";
import { ProofreadMenu } from "@/components/editor/proofread-menu";
import { ProofreadBar, ProofreadSheet } from "@/components/editor/proofread-review";
import { EditorToolbar, TranslateButton } from "@/components/editor/toolbar";
import { TranslationError } from "@/components/editor/translation-error";
import { useLeaveNotice } from "@/components/editor/use-leave-notice";
import { type EditorView, ViewSwitch } from "@/components/editor/view-switch";
import { Button } from "@/components/ui/button";
import { useHosted } from "@/keys/hosted-context";
import { contentsFirst } from "@/lib/chapter-order";
import { chapterStatus, hasAnyTranslation, isBusy, progressFor } from "@/lib/chapter-status";
import { useRecordLastOpened } from "@/lib/last-opened-store";
import { modelName } from "@/lib/model-name";
import { chapterText } from "@/lib/text";
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

  const chapters = contentsFirst(book.data?.chapters ?? []);
  const chapterId =
    chapters.find((c) => c.id === search.chapter)?.id ??
    chapters.find((c) => c.id !== CONTENTS_CHAPTER_ID)?.id ??
    chapters[0]?.id;
  const chapterIndex = chapters.findIndex((c) => c.id === chapterId);
  useRecordLastOpened(bookId, chapterId === CONTENTS_CHAPTER_ID ? undefined : chapterId);
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
  const glossaryFirst = useGlossaryFirst(book.data?.projectId);
  /** Every translation the editor starts goes through here; `null` means all chapters. */
  const startTranslation = (target: string | null | undefined) => {
    if (!body || target === undefined) return;
    void glossaryFirst.guard(() =>
      action.mutate(
        target === null
          ? { kind: "translate-all", body }
          : { kind: "translate", chapterId: target, body },
      ),
    );
  };

  const [railOpen, setRailOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [phoneView, setPhoneView] = useState<EditorView>("both");
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
    ? "No API key yet. Add one under Settings → API keys."
    : "No provider configured. Set ANTHROPIC_API_KEY in apps/api/.env";

  const proofreads = useProofreads(jobId);
  const proofread = useProofread(jobId, chapterId);
  const decide = useProofreadDecision(jobId, chapterId);
  const discard = useDiscardProofread(jobId, chapterId);
  const proofreadRun = useProofreadRun(jobId);
  const [reviewOpen, setReviewOpen] = useState(false);

  const pendingByChapter = useMemo(
    () => new Map((proofreads.data ?? []).map((p) => [p.chapterId, p.pending])),
    [proofreads.data],
  );
  const proofreadIds = new Set((proofreads.data ?? []).map((p) => p.chapterId));
  const translatedIds = chapters
    .filter((c) => (progressFor(job.data, c.id)?.done ?? 0) > 0)
    .map((c) => c.id);
  const pendingHere = useMemo(
    () =>
      new Set(
        (proofread.data?.suggestions ?? [])
          .filter((s) => s.state === "pending")
          .map((s) => s.segmentId),
      ),
    [proofread.data],
  );
  const positions = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of chapter.data?.blocks ?? [])
      if (b.kind === "segment") map.set(b.id, map.size + 1);
    return map;
  }, [chapter.data]);
  const providerLabel = providers.data?.find((p) => p.id === selection?.provider)?.label;
  const chaptersDone = chapters.filter(
    (c) => chapterStatus(progressFor(job.data, c.id), c.segmentCount).state === "done",
  ).length;
  const activeChapter = chapters.find((c) => c.id === chapterId);
  const chapterTitle =
    chapterId === CONTENTS_CHAPTER_ID
      ? "Book title & navigation"
      : ((chapterId && job.data?.titles.chapters[chapterId]) ?? activeChapter?.title);

  useLeaveNotice(
    busy && chapterTitle
      ? `${chapterTitle} keeps translating in the background`
      : busyElsewhere > 0
        ? "Translation keeps running in the background"
        : null,
  );

  const { running, done: proofreadDone, error: proofreadError } = proofreadRun.state;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current) return;
    wasRunning.current = false;
    if (proofreadError) toast.error(`Proofreading stopped: ${proofreadError}`);
    else if (proofreadDone > 0) {
      toast.success(
        `Proofread ${proofreadDone} chapter${proofreadDone === 1 ? "" : "s"}. Review the suggestions chapter by chapter.`,
      );
    }
  }, [running, proofreadDone, proofreadError]);

  const jumpTo = (segmentId: string) => {
    setReviewOpen(false);
    window.setTimeout(() => {
      const row = scrollRef.current?.querySelector<HTMLElement>(
        `[data-segment-id="${CSS.escape(segmentId)}"]`,
      );
      if (!row) {
        toast.message("Scroll further down to load that paragraph.");
        return;
      }
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.setAttribute("data-flash", "");
      window.setTimeout(() => row.removeAttribute("data-flash"), 1600);
    }, 250);
  };

  const openSuggestion = (segmentId: string) => {
    setReviewOpen(true);
    window.setTimeout(() => {
      document
        .querySelector(`[data-suggestion="${CSS.escape(segmentId)}"]`)
        ?.scrollIntoView({ block: "center" });
    }, 250);
  };

  if (book.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        This book could not be loaded.
      </div>
    );
  }

  const rail = {
    chapters,
    job: job.data,
    activeId: chapterId,
    onSelect: goTo,
    pending: pendingByChapter,
    sourceLang: book.data?.sourceLang,
  };

  const proofreadProps: Omit<ComponentProps<typeof ProofreadMenu>, "labelled" | "className"> = {
    waiting: pendingHere.size,
    scope: {
      chapterId,
      chapterTranslated: (chapterProgress?.done ?? 0) > 0,
      chapterProofread: Boolean(chapterId && proofreadIds.has(chapterId)),
      unproofread: translatedIds.filter((id) => !proofreadIds.has(id)),
      translated: translatedIds,
    },
    run: proofreadRun.state,
    disabledHint:
      !selection || !jobId
        ? noProviderHint
        : translatedIds.length === 0
          ? "Translate a chapter first"
          : null,
    modelLabel: `${providerLabel ?? selection?.provider ?? "the AI"} (${selection?.model ?? ""})`,
    onStart: (ids) => selection && void proofreadRun.start(ids, selection),
    onStop: proofreadRun.stop,
  };
  const exportProps: Omit<ComponentProps<typeof ExportMenu>, "labelled" | "className"> = {
    translationHref: jobId ? api.exportUrl(jobId, "epub") : undefined,
    bilingualHref: jobId ? api.exportUrl(jobId, "epub", "bilingual") : undefined,
    txtHref: jobId ? api.exportUrl(jobId, "txt") : undefined,
    onExport: api.signedExports
      ? (href) => {
          api.openExport(href).catch(() => toast.error("Could not prepare the export"));
        }
      : undefined,
    disabled: !hasAnyTranslation(job.data),
    hint: "Translate a chapter first",
  };
  const canTranslate = Boolean(selection && jobId && chapterId);
  const starting = action.isPending && action.variables?.kind !== "clear";
  const titlesBusy = isBusy(progressFor(job.data, CONTENTS_CHAPTER_ID)?.status);
  const chapterTranslated = (chapterProgress?.done ?? 0) > 0;
  const clearChapter = () => chapterId && action.mutate({ kind: "clear", chapterId });
  const reviewTotal = proofread.data?.suggestions.length ?? 0;
  const translationText = chapter.data ? chapterText(chapter.data, "target") : "";

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader
        bookId={bookId}
        book={book.data}
        translatedTitle={job.data?.titles.book}
        chapterId={chapterId}
        jobId={jobId}
        onOpenRail={() => setRailOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <ChapterRailPanel title="Chapters" className="hidden w-72 shrink-0 md:flex" {...rail} />
        <ChapterSheet title="Chapters" open={railOpen} onOpenChange={setRailOpen} {...rail} />
        <main className="flex min-w-0 flex-1 flex-col">
          <EditorToolbar
            model={
              <ModelSheet
                providers={providers.data}
                selection={selection}
                onSelection={onSelection}
                mode={effectiveMode(mode, batchAvailable)}
                batchAvailable={batchAvailable}
                onMode={onMode}
                targetLang={targetLang}
                onTargetLang={setTargetLang}
                open={modelOpen}
                onOpenChange={setModelOpen}
              />
            }
            proofread={<ProofreadMenu {...proofreadProps} />}
            chapterProgress={chapterProgress}
            canTranslate={canTranslate}
            noProviderHint={noProviderHint}
            starting={starting}
            hasTranslation={!exportProps.disabled}
            onTranslate={() => startTranslation(chapterId)}
            onTranslateAll={() => startTranslation(null)}
            onTranslateTitles={() => startTranslation(CONTENTS_CHAPTER_ID)}
            titlesBusy={titlesBusy}
            epubHref={exportProps.translationHref}
            bilingualEpubHref={exportProps.bilingualHref}
            txtHref={exportProps.txtHref}
            onExport={exportProps.onExport}
          />
          <TranslationError chapterError={chapterProgress?.error} jobError={job.data?.error} />
          <div className="max-sm:hidden">
            <ProofreadBar proofread={proofread.data} onOpen={() => setReviewOpen(true)} />
          </div>
          <ProofreadSheet
            open={reviewOpen}
            onOpenChange={setReviewOpen}
            proofread={proofread.data}
            chapterTitle={chapter.data?.title ?? ""}
            positions={positions}
            busy={decide.isPending || discard.isPending}
            onDecide={(decision) =>
              decide.mutate(decision, {
                onSuccess: (result) => {
                  const outdated = result.suggestions.filter(
                    (s) => s.state === "outdated" && decision.accept?.includes(s.segmentId),
                  ).length;
                  if (outdated > 0) {
                    toast.warning(
                      `${outdated} suggestion${outdated === 1 ? " was" : "s were"} not applied because the paragraph changed after proofreading.`,
                    );
                  }
                },
                onError: () => toast.error("Could not save your decision"),
              })
            }
            onDiscard={() =>
              discard.mutate(undefined, {
                onSuccess: () => setReviewOpen(false),
                onError: () => toast.error("Could not clear the results"),
              })
            }
            onJump={jumpTo}
          />
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-background">
            <ViewSwitch
              view={phoneView}
              onChange={setPhoneView}
              className="sticky top-0 z-20 sm:hidden"
            />
            <ChapterStatusBlock
              title={chapterTitle}
              progress={chapterProgress}
              segmentCount={activeChapter?.segmentCount ?? 0}
              chaptersDone={chaptersDone}
              totalChapters={chapters.length}
              busyElsewhere={busyElsewhere}
              onCancel={() => action.mutate({ kind: "cancel" })}
              {...(hosted ? { onCheckBatch: checkBatch } : {})}
            />
            <EditorPanes
              view={chapter.data}
              loading={chapter.isPending || book.isPending || workspace.isPending}
              busy={busy}
              sourceLang={(book.data?.sourceLang ?? "src").slice(0, 2)}
              targetLang={targetLang}
              hasTranslation={chapterTranslated}
              hasMore={chapter.hasMore}
              loadingMore={chapter.loadingMore}
              onLoadMore={chapter.loadMore}
              canRetry={canTranslate && !busy}
              failedCount={chapterProgress?.failed}
              onRetryFailed={() => startTranslation(chapterId)}
              onClear={clearChapter}
              suggested={pendingHere}
              onSuggestion={openSuggestion}
              phoneView={phoneView}
            />
            {!chapter.hasMore && (
              <ChapterPager
                hasPrev={chapterIndex > 0}
                hasNext={chapterIndex >= 0 && chapterIndex < chapters.length - 1}
                onPrev={() => goTo(chapters[chapterIndex - 1]?.id)}
                onNext={() => goTo(chapters[chapterIndex + 1]?.id)}
              />
            )}
          </div>
          <PhoneBar
            onChapters={() => setRailOpen(true)}
            onMore={() => setMoreOpen(true)}
            translate={
              <TranslateButton
                wrap
                chapterProgress={chapterProgress}
                canTranslate={canTranslate}
                noProviderHint={noProviderHint}
                starting={starting}
                onTranslate={() => startTranslation(chapterId)}
              />
            }
          />
          {glossaryFirst.dialog}
          <MoreSheet
            open={moreOpen}
            onOpenChange={setMoreOpen}
            title={book.data ? volumeLabel(book.data) : "More"}
            modelLabel={selection ? modelName(selection.model) : "Choose a model"}
            onModel={() => setModelOpen(true)}
            translateDisabled={!canTranslate || starting}
            titlesDisabled={!canTranslate || starting || titlesBusy}
            onTranslateAll={() => startTranslation(null)}
            onTranslateTitles={() => startTranslation(CONTENTS_CHAPTER_ID)}
            proofread={<ProofreadMenu {...proofreadProps} labelled className={MORE_ITEM} />}
            review={
              reviewTotal > 0
                ? {
                    label:
                      pendingHere.size > 0
                        ? `Review ${pendingHere.size} suggestion${pendingHere.size === 1 ? "" : "s"}`
                        : "Show proofread results",
                    onOpen: () => setReviewOpen(true),
                  }
                : null
            }
            exportMenu={<ExportMenu {...exportProps} labelled className={MORE_ITEM} />}
            read={
              chapterId ? (
                <Button variant="ghost" className={MORE_ITEM} asChild>
                  <Link
                    to="/books/$bookId/read/$chapterId"
                    params={{ bookId, chapterId }}
                    search={{ job: jobId }}
                  >
                    <BookOpen />
                    Read this volume
                  </Link>
                </Button>
              ) : null
            }
            onCopy={
              translationText ? () => void copyText(translationText, "Translation") : undefined
            }
            onClear={chapterTranslated && !busy ? clearChapter : undefined}
          />
        </main>
      </div>
    </div>
  );
}
