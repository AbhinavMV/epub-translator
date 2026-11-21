import type { ProviderInfo, TranslateMode } from "@et/contracts";
import { TARGET_LANGUAGES } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { BookOpen, Library, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { AppMark } from "@/components/app-mark";
import { BookTitle } from "@/components/book-title";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeysDialog } from "@/keys/keys-dialog";
import { ModeToggle } from "./mode-toggle";
import type { Selection } from "./model-selection";
import { ProviderSelect } from "./provider-select";

export function EditorHeader({
  bookId,
  projectId,
  title,
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
  projectId: string | null | undefined;
  title: string | undefined;
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
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card/60 px-3 py-2 md:px-4">
      {/* The controls wrap below this group whenever both cannot share one line. */}
      <div className="flex min-w-64 flex-1 items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label="Open chapters"
          onClick={onOpenRail}
        >
          <Menu />
        </Button>
        <AppMark />
        <BookTitle title={title} translated={translatedTitle} />
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ProviderSelect providers={providers} selection={selection} onChange={onSelection} />
        <KeysDialog />
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
        {projectId ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/projects/$projectId"
              params={{ projectId }}
              aria-label="Project glossary and custom prompt"
            >
              <Library />
              <span className="hidden sm:inline">Project</span>
            </Link>
          </Button>
        ) : null}
        {proofread}
        {chapterId ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/books/$bookId/read/$chapterId"
              params={{ bookId, chapterId }}
              search={{ job: jobId }}
            >
              <BookOpen />
              <span className="hidden sm:inline">Reader</span>
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
