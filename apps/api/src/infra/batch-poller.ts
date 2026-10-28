export function startBatchPolling(poll: () => Promise<void>, intervalMs: number): () => void {
  const tick = () => {
    poll().catch(() => {});
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
