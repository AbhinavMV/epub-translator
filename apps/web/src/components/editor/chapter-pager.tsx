import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChapterPager({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav
      aria-label="Chapter navigation"
      className="flex flex-wrap justify-between gap-2 px-3 py-5 sm:px-5"
    >
      <Button variant="outline" disabled={!hasPrev} onClick={onPrev}>
        <ArrowLeft />
        Previous chapter
      </Button>
      <Button variant="outline" disabled={!hasNext} onClick={onNext}>
        Next chapter
        <ArrowRight />
      </Button>
    </nav>
  );
}
