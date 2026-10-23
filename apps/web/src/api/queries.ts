import type { BookSettings, JobSummary, TranslateBody } from "@et/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useChapter(
  bookId: string,
  chapterId: string | undefined,
  jobId: string | undefined,
) {
  const api = useApi();
  return useQuery({
    queryKey: keys.chapter(jobId ?? "", chapterId ?? ""),
    queryFn: () => api.getChapter(bookId, chapterId ?? "", jobId ?? ""),
    enabled: Boolean(chapterId && jobId),
    placeholderData: keepPreviousData,
  });
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
