import type {
  BookSettings,
  ChapterView,
  ImportPlacement,
  JobSummary,
  ProjectTerms,
  ProofreadDecisionBody,
  ResolveGlossaryConflict,
  SampleSize,
  TranslateBody,
} from "@et/contracts";
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "./api-context";
import type { PendingImport } from "./client";
import { keys } from "./keys";

export function useProjects() {
  const api = useApi();
  return useQuery({ queryKey: keys.projects, queryFn: () => api.listProjects() });
}

export function useProject(id: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.project(id), queryFn: () => api.getProject(id) });
}

export function useRenameProject(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.renameProject(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useDeleteProject(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteProject(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.project(id) });
      queryClient.removeQueries({ queryKey: keys.projectSettings(id) });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.books }),
        queryClient.invalidateQueries({ queryKey: keys.projects, exact: true }),
      ]);
    },
  });
}

export function useMoveBook(bookId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.moveBook(bookId, projectId),
    onSuccess: () =>
      Promise.all([
        invalidateLibrary(queryClient),
        queryClient.invalidateQueries({ queryKey: keys.book(bookId) }),
      ]),
  });
}

export function useProjectSettings(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.projectSettings(id ?? ""),
    queryFn: () => api.getProjectSettings(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useSaveProjectTerms(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (terms: ProjectTerms) => api.saveProjectTerms(id, terms),
    onSuccess: (settings) => queryClient.setQueryData(keys.projectSettings(id), settings),
  });
}

export function useResolveGlossaryConflict(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: ResolveGlossaryConflict) => api.resolveGlossaryConflict(id, choice),
    onSuccess: (settings) => queryClient.setQueryData(keys.projectSettings(id), settings),
  });
}

function invalidateLibrary(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.books }),
    queryClient.invalidateQueries({ queryKey: keys.projects }),
  ]);
}

export function useBooks() {
  const api = useApi();
  return useQuery({ queryKey: keys.books, queryFn: () => api.listBooks() });
}

export function useBook(id: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.book(id), queryFn: () => api.getBook(id) });
}

export function useProviders() {
  const api = useApi();
  return useQuery({ queryKey: keys.providers, queryFn: () => api.listProviders() });
}

export function useWorkspace(bookId: string, lang: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.workspace(bookId, lang),
    queryFn: () => api.getWorkspace(bookId, lang),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useJob(jobId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.job(jobId ?? ""),
    queryFn: () => api.getJob(jobId ?? ""),
    enabled: Boolean(jobId),
    initialData: () =>
      jobId
        ? queryClient
            .getQueriesData<JobSummary>({ queryKey: ["workspace"] })
            .map(([, job]) => job)
            .find((job) => job?.id === jobId)
        : undefined,
  });
}

function joinParts(data: InfiniteData<ChapterView, number>): ChapterView {
  const first = data.pages[0] as ChapterView;
  const last = data.pages[data.pages.length - 1] as ChapterView;
  return {
    ...first,
    part: last.part,
    partCount: last.partCount,
    blocks: data.pages.flatMap((p) => p.blocks),
  };
}

export function useChapter(
  bookId: string,
  chapterId: string | undefined,
  jobId: string | undefined,
) {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: keys.chapter(jobId ?? "", chapterId ?? ""),
    queryFn: ({ pageParam }) => api.getChapter(bookId, chapterId ?? "", jobId ?? "", pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.part + 1 < last.partCount ? last.part + 1 : undefined),
    select: joinParts,
    enabled: Boolean(chapterId && jobId),
    placeholderData: keepPreviousData,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  return {
    data: query.data,
    isPending: query.isPending,
    hasMore: hasNextPage,
    loadingMore: isFetchingNextPage,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
  };
}

export function usePrepareImport() {
  const api = useApi();
  return useMutation({ mutationFn: (file: File) => api.prepareImport(file) });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pending, placement }: { pending: PendingImport; placement: ImportPlacement }) =>
      pending.commit(placement),
    onSuccess: () => invalidateLibrary(queryClient),
  });
}

export function useSetVolumeNumber(bookId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (volumeNumber: number) => api.setVolumeNumber(bookId, volumeNumber),
    onSuccess: () =>
      Promise.all([
        invalidateLibrary(queryClient),
        queryClient.invalidateQueries({ queryKey: keys.book(bookId) }),
      ]),
  });
}

export function useDeleteBook() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBook(id),
    onSuccess: () => invalidateLibrary(queryClient),
  });
}

export function useSaveSettings(bookId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: BookSettings) => api.saveSettings(bookId, settings),
    onSuccess: (settings) =>
      queryClient.setQueryData(keys.book(bookId), (book: unknown) =>
        book && typeof book === "object" ? { ...book, settings } : book,
      ),
  });
}

type JobAction =
  | { kind: "translate"; chapterId: string; body: TranslateBody }
  | { kind: "translate-all"; body: TranslateBody }
  | { kind: "retry"; chapterId: string; body: TranslateBody }
  | { kind: "clear"; chapterId: string }
  | { kind: "cancel" };

export interface VolumePlan {
  bookId: string;
  requests: number;
  chars: number;
}

export function useGlossaryPlans(
  bookIds: readonly string[],
  size: SampleSize,
): VolumePlan[] | undefined {
  const api = useApi();
  return useQueries({
    queries: bookIds.map((bookId) => ({
      queryKey: keys.glossaryPlan(bookId, size),
      queryFn: async (): Promise<VolumePlan> => ({
        bookId,
        ...(await api.planGlossarySample(bookId, size)),
      }),
    })),
    combine: (results) => {
      const plans = results.map((r) => r.data);
      return plans.every((p) => p !== undefined) ? plans : undefined;
    },
  });
}

export function useJobAction(jobId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: JobAction): Promise<JobSummary | null> => {
      if (!jobId) throw new Error("Workspace is not ready");
      switch (action.kind) {
        case "translate":
          return api.translateChapter(jobId, action.chapterId, action.body);
        case "translate-all":
          return api.translateAll(jobId, action.body);
        case "retry":
          return api.retryChapter(jobId, action.chapterId, action.body);
        case "clear":
          return api.clearChapter(jobId, action.chapterId);
        case "cancel":
          return api.cancelJob(jobId);
      }
    },
    onSuccess: async (job, action) => {
      if (!jobId) return;
      if (job) queryClient.setQueryData(keys.job(jobId), job);
      else await queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
      const chapterId = "chapterId" in action ? action.chapterId : undefined;
      await queryClient.invalidateQueries({
        queryKey: chapterId ? keys.chapter(jobId, chapterId) : ["chapter", jobId],
      });
    },
  });
}

export function useProofreads(jobId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.proofreads(jobId ?? ""),
    queryFn: () => api.listProofreads(jobId ?? ""),
    enabled: Boolean(jobId),
  });
}

export function useProofread(jobId: string | undefined, chapterId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: keys.proofread(jobId ?? "", chapterId ?? ""),
    queryFn: () => api.getProofread(jobId ?? "", chapterId ?? ""),
    enabled: Boolean(jobId && chapterId),
  });
}

export function useProofreadDecision(jobId: string | undefined, chapterId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: ProofreadDecisionBody) => {
      if (!jobId || !chapterId) throw new Error("Workspace is not ready");
      return api.decideProofread(jobId, chapterId, decision);
    },
    onSuccess: async (proofread) => {
      if (!jobId || !chapterId) return;
      queryClient.setQueryData(keys.proofread(jobId, chapterId), proofread);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.proofreads(jobId) }),
        queryClient.invalidateQueries({ queryKey: keys.chapter(jobId, chapterId) }),
      ]);
    },
  });
}

export function useDiscardProofread(jobId: string | undefined, chapterId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!jobId || !chapterId) throw new Error("Workspace is not ready");
      await api.discardProofread(jobId, chapterId);
    },
    onSuccess: async () => {
      if (!jobId || !chapterId) return;
      queryClient.setQueryData(keys.proofread(jobId, chapterId), null);
      await queryClient.invalidateQueries({ queryKey: keys.proofreads(jobId) });
    },
  });
}
