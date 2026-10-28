import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { keys } from "@/api/keys";
import { type Hosted, useVaultSnapshot } from "@/keys/hosted-context";

const CHAPTER_INVALIDATE_MS = 400;
const JOB_POLL_MS = 10_000;
export const BATCH_POLL_MS = 2 * 60_000;

export function useHostedSync(hosted: Hosted | null, jobId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!hosted) return;
    return hosted.runtime.subscribe((event) => {
      if (event.kind === "providers") {
        void queryClient.invalidateQueries({ queryKey: keys.providers });
      }
    });
  }, [hosted, queryClient]);

  useEffect(() => {
    if (!hosted || !jobId) return;
    let chapterTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
      if (chapterTimer) return;
      chapterTimer = setTimeout(() => {
        chapterTimer = null;
        void queryClient.invalidateQueries({ queryKey: ["chapter", jobId] });
      }, CHAPTER_INVALIDATE_MS);
    };
    const off = hosted.runtime.subscribe((event) => {
      if (event.kind === "progress" && event.jobId === jobId) refresh();
    });
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        void queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
      }
    }, JOB_POLL_MS);
    return () => {
      off();
      clearInterval(poll);
      if (chapterTimer) clearTimeout(chapterTimer);
    };
  }, [hosted, jobId, queryClient]);
}

export function useBatchPolling(
  hosted: Hosted | null,
  jobId: string | undefined,
  hasSubmitted: boolean,
): () => void {
  const status = useVaultSnapshot(hosted?.vault)?.status;

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check whenever the vault unlocks
  useEffect(() => {
    if (!hosted || !jobId) return;
    const check = () => void hosted.runtime.pollBatches(jobId, false).catch(() => undefined);
    check();
    if (!hasSubmitted) return;
    const timer = setInterval(check, BATCH_POLL_MS);
    return () => clearInterval(timer);
  }, [hosted, jobId, hasSubmitted, status === "unlocked"]);

  return () => {
    if (hosted && jobId) void hosted.runtime.pollBatches(jobId, true).catch(() => undefined);
  };
}
