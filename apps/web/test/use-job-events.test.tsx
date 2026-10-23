import type { JobEvent, JobSummary } from "@et/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/api-context";
import type { Api, EventSourceLike } from "@/api/client";
import { keys } from "@/api/keys";
import { useJobEvents } from "@/api/use-job-events";
import { makeJob } from "./fixtures";

class FakeSource implements EventSourceLike {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  close() {
    this.closed = true;
  }
  emit(event: JobEvent | string) {
    this.onmessage?.({ data: typeof event === "string" ? event : JSON.stringify(event) });
  }
}

function setup() {
  const source = new FakeSource();
  const api = { openJobEvents: () => source } as unknown as Api;
  const client = new QueryClient();
  client.setQueryData(keys.job("job1"), makeJob());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiProvider>
  );
  return { source, client, wrapper };
}

describe("useJobEvents", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("patches chapter progress in query cache", () => {
    const { source, client, wrapper } = setup();
    renderHook(() => useJobEvents("job1"), { wrapper });
    source.emit({
      type: "chapter.progress",
      jobId: "job1",
      progress: {
        chapterId: "c1",
        status: "running",
        done: 2,
        flagged: 0,
        failed: 0,
        total: 4,
        error: null,
      },
    });
    const job = client.getQueryData<JobSummary>(keys.job("job1"));
    expect(job?.progress.find((p) => p.chapterId === "c1")?.done).toBe(2);
    expect(job?.progress.find((p) => p.chapterId === "c2")?.done).toBe(0);
  });

  it("replaces the job on job.status and ignores malformed payloads", () => {
    const { source, client, wrapper } = setup();
    renderHook(() => useJobEvents("job1"), { wrapper });
    source.emit("not json");
    source.emit({ type: "job.status", job: makeJob({ status: "running" }) });
    expect(client.getQueryData<JobSummary>(keys.job("job1"))?.status).toBe("running");
  });

  it("throttles chapter invalidation on segment.done", () => {
    const { source, client, wrapper } = setup();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useJobEvents("job1"), { wrapper });
    for (const id of ["s1", "s2", "s3"]) {
      source.emit({
        type: "segment.done",
        jobId: "job1",
        chapterId: "c1",
        segmentId: id,
        status: "done",
      });
    }
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.chapter("job1", "c1") });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("closes the source on unmount", () => {
    const { source, wrapper } = setup();
    const { unmount } = renderHook(() => useJobEvents("job1"), { wrapper });
    unmount();
    expect(source.closed).toBe(true);
  });
});
