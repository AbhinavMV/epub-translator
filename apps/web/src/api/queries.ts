import type {
  BookSettings,
  ChapterView,
  JobSummary,
  ProofreadDecisionBody,
  SuggestGlossaryBody,
  TranslateBody,
} from "@et/contracts";
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "./api-context";
import { keys } from "./keys";

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

export function useUploadBook() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadBook(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.books }),
  });
}

export function useDeleteBook() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.books }),
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

export function useSuggestGlossary(bookId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (body: SuggestGlossaryBody) => api.suggestGlossary(bookId, body),
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
