import { useEffect, useRef } from "react";

const PREFETCH_MARGIN = "800px 0px";

export function PartSentinel({
  hasMore,
  loading,
  onVisible,
}: {
  hasMore: boolean;
  loading: boolean;
  onVisible: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div ref={ref} data-testid="part-sentinel" className="px-5 py-4">
      {loading ? (
        <p role="status" className="font-mono text-xs text-muted-foreground">
          Loading more of this chapter…
        </p>
      ) : null}
    </div>
  );
}
