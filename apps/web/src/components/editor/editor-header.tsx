import type { BookDetail, ProviderInfo, TranslateMode } from "@et/contracts";
import { TARGET_LANGUAGES } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { BookOpen, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { AppHeader, useVolumeCrumbs } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModeToggle } from "./mode-toggle";
import type { Selection } from "./model-selection";
import { ProviderSelect } from "./provider-select";

export function EditorHeader({
  bookId,
  book,
  translatedTitle,
  chapterId,
  jobId,
  providers,
  selection,
  onSelection,
  mode,
  batchAvailable,
  onMode,
  targetLang,
  onTargetLang,
  onOpenRail,
  proofread,
}: {
  bookId: string;
  book: BookDetail | undefined;
  translatedTitle: string | null | undefined;
  chapterId: string | undefined;
  jobId: string | undefined;
  providers: ProviderInfo[] | undefined;
  selection: Selection | null;
  onSelection: (s: Selection) => void;
  mode: TranslateMode;
  batchAvailable: boolean;
  onMode: (mode: TranslateMode) => void;
  targetLang: string;
  onTargetLang: (code: string) => void;
  onOpenRail: () => void;
  proofread?: ReactNode;
}) {
  const crumbs = useVolumeCrumbs(book, translatedTitle);
  return (
    <>
      <AppHeader
        crumbs={crumbs}
        leading={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open chapters"
            onClick={onOpenRail}
          >
            <Menu />
          </Button>
        }
        actions={
          chapterId ? (
            <Button variant="ghost" asChild>
              <Link
                to="/books/$bookId/read/$chapterId"
                params={{ bookId, chapterId }}
                search={{ job: jobId }}
                aria-label="Read"
              >
                <BookOpen />
                <span className="max-sm:hidden">Read</span>
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-3 py-2 md:px-4">
        <ProviderSelect providers={providers} selection={selection} onChange={onSelection} />
        <ModeToggle mode={mode} batchAvailable={batchAvailable} onChange={onMode} />
        <Select value={targetLang} onValueChange={onTargetLang}>
          <SelectTrigger size="sm" className="w-[7.5rem]" aria-label="Target language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {proofread}
      </div>
    </>
  );
}
