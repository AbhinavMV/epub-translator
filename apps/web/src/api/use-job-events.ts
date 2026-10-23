import { type JobEvent, JobEventSchema, type JobSummary } from "@et/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApi } from "./api-context";
import { keys } from "./keys";

const INVALIDATE_MS = 400;

export function useJobEvents(jobId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!jobId) return;
    const source = api.openJobEvents(jobId);
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const invalidateChapter = (chapterId: string) =>
      queryClient.invalidateQueries({ queryKey: keys.chapter(jobId, chapterId) });

    const scheduleInvalidate = (chapterId: string) => {
      if (timers.has(chapterId)) return;
      timers.set(
        chapterId,
        setTimeout(() => {
          timers.delete(chapterId);
          void invalidateChapter(chapterId);
        }, INVALIDATE_MS),
      );
    };

    const apply = (event: JobEvent) => {
      switch (event.type) {
        case "job.status":
          queryClient.setQueryData(keys.job(jobId), event.job);
          return;
        case "chapter.progress": {
          const { progress } = event;
          queryClient.setQueryData<JobSummary>(keys.job(jobId), (job) => {
            if (!job) return job;
            const exists = job.progress.some((p) => p.chapterId === progress.chapterId);
            return {
              ...job,
              progress: exists
                ? job.progress.map((p) => (p.chapterId === progress.chapterId ? progress : p))
                : [...job.progress, progress],
            };
          });
          if (progress.status === "done" || progress.status === "partial") {
            void invalidateChapter(progress.chapterId);
          }
          return;
        }
        case "segment.done":
          scheduleInvalidate(event.chapterId);
          return;
      }
    };

    source.onmessage = (e) => {
      try {
        const parsed = JobEventSchema.safeParse(JSON.parse(e.data));
        if (parsed.success) apply(parsed.data);
      } catch {
        // malformed frame: ignore
      }
    };
    source.onerror = () => {
      void queryClient.invalidateQueries({ queryKey: keys.job(jobId) });
    };

    return () => {
      source.onmessage = null;
      source.onerror = null;
      source.close();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, [api, jobId, queryClient]);
}
