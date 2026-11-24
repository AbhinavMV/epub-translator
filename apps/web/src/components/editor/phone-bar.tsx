import { List, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

const STACKED =
  "h-auto shrink-0 flex-col gap-0.5 px-2 py-1 text-xs has-[>svg]:px-2 coarse:h-auto coarse:min-h-11";

export function PhoneBar({
  translate,
  onChapters,
  onMore,
}: {
  translate: ReactNode;
  onChapters: () => void;
  onMore: () => void;
}) {
  return (
    <fieldset
      aria-label="Chapter actions"
      className="flex min-w-0 items-center gap-2 border-t bg-background px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:hidden"
    >
      <Button variant="ghost" size="sm" className={STACKED} onClick={onChapters}>
        <List />
        Chapters
      </Button>
      <div className="flex min-w-0 flex-1 [&>*]:w-full">{translate}</div>
      <Button variant="ghost" size="sm" className={STACKED} onClick={onMore}>
        <MoreHorizontal />
        More
      </Button>
    </fieldset>
  );
}
