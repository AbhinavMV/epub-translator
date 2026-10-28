import type { BookSettings, GlossaryEntry, ProviderInfo, TranslateMode } from "@et/contracts";
import { TARGET_LANGUAGES } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { BookOpen, Menu } from "lucide-react";
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
import { GlossaryDialog } from "./glossary-dialog";
import { ModeToggle } from "./mode-toggle";
import type { Selection } from "./model-selection";
import { PromptDialog } from "./prompt-dialog";
import { ProviderSelect } from "./provider-select";

export function EditorHeader({
  bookId,
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
  settings,
  saving,
  onSaveGlossary,
  onSavePrompt,
  onOpenRail,
}: {
  bookId: string;
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
  settings: BookSettings | undefined;
  saving: boolean;
  onSaveGlossary: (glossary: GlossaryEntry[]) => Promise<unknown>;
  onSavePrompt: (prompt: string) => Promise<unknown>;
  onOpenRail: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card/60 px-3 py-2 md:px-4 lg:flex-nowrap">
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
      <div className="order-last flex w-full flex-wrap items-center gap-2 lg:order-none lg:w-auto lg:shrink-0 lg:flex-nowrap">
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
        <GlossaryDialog
          bookId={bookId}
          targetLang={targetLang}
          providers={providers}
          selection={selection}
          settings={settings}
          saving={saving}
          onSave={onSaveGlossary}
        />
        <PromptDialog
          value={settings?.customPrompt}
          disabled={!settings}
          saving={saving}
          onSave={onSavePrompt}
        />
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
      <div className="ml-auto shrink-0 lg:ml-0">
        <ThemeToggle />
      </div>
    </header>
  );
}
