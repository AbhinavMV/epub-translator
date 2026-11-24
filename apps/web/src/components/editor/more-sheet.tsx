import { Copy, Eraser, Heading, Languages, List, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const MORE_ITEM =
  "h-auto min-h-9 w-full justify-start py-1.5 text-left whitespace-normal coarse:h-auto coarse:min-h-11";

export function MoreSheet({
  open,
  onOpenChange,
  title,
  modelLabel,
  onModel,
  translateDisabled,
  titlesDisabled,
  onTranslateAll,
  onTranslateTitles,
  proofread,
  review,
  exportMenu,
  read,
  onCopy,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  modelLabel: string;
  onModel: () => void;
  translateDisabled: boolean;
  titlesDisabled: boolean;
  onTranslateAll: () => void;
  onTranslateTitles: () => void;
  proofread: ReactNode;
  review: { label: string; onOpen: () => void } | null;
  exportMenu: ReactNode;
  read: ReactNode;
  onCopy: (() => void) | undefined;
  onClear: (() => void) | undefined;
}) {
  const close = (then: () => void) => () => {
    onOpenChange(false);
    then();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="break-words">{title}</SheetTitle>
          <SheetDescription className="sr-only">Tools for this volume</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 gap-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Button variant="ghost" className={MORE_ITEM} onClick={close(onModel)}>
            <Languages />
            <span className="min-w-0 break-words">Model and mode · {modelLabel}</span>
          </Button>
          <Button
            variant="ghost"
            className={MORE_ITEM}
            disabled={translateDisabled}
            onClick={close(onTranslateAll)}
          >
            <List />
            Translate all chapters
          </Button>
          <Button
            variant="ghost"
            className={MORE_ITEM}
            disabled={titlesDisabled}
            onClick={close(onTranslateTitles)}
          >
            <Heading />
            Translate title & contents
          </Button>
          {proofread}
          {review && (
            <Button variant="ghost" className={MORE_ITEM} onClick={close(review.onOpen)}>
              <Sparkles />
              {review.label}
            </Button>
          )}
          {exportMenu}
          {onCopy && (
            <Button variant="ghost" className={MORE_ITEM} onClick={onCopy}>
              <Copy />
              Copy translation
            </Button>
          )}
          {onClear && (
            <Button variant="ghost" className={MORE_ITEM} onClick={close(onClear)}>
              <Eraser />
              Clear translation
            </Button>
          )}
          {read}
        </div>
      </SheetContent>
    </Sheet>
  );
}
