export interface BatchPollable {
  pollBatches(): Promise<void>;
}

export function startBatchPolling(runner: BatchPollable, intervalMs: number): () => void {
  const tick = () => {
    runner.pollBatches().catch(() => {});
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
