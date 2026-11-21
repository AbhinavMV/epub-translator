import type { BookSummary, GlossaryEntry } from "@et/contracts";
import { TARGET_LANGUAGES } from "@et/contracts";
import { useState } from "react";
import { useProviders } from "@/api/queries";
import { GlossarySuggestions } from "@/components/editor/glossary-suggestions";
import { resolveSelection, type Selection } from "@/components/editor/model-selection";
import { ProviderSelect } from "@/components/editor/provider-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const volumeLabel = (book: BookSummary) =>
  book.volumeNumber === null || book.volumeNumber === undefined
    ? book.title
    : `Vol. ${book.volumeNumber}`;

export function ProjectGlossarySuggestions({
  books,
  onAdd,
}: {
  books: BookSummary[];
  onAdd: (entries: GlossaryEntry[]) => void;
}) {
  const providers = useProviders();
  const [bookId, setBookId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState("en");
  const [chosen, setChosen] = useState<Selection | null>(null);
  const selection = chosen ?? resolveSelection(undefined, providers.data);
  const sampled = books.find((b) => b.id === bookId) ?? books.at(-1);

  if (!sampled) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sampled.id} onValueChange={setBookId}>
          <SelectTrigger size="sm" className="w-[9rem]" aria-label="Volume to sample">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {books.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {volumeLabel(b)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetLang} onValueChange={setTargetLang}>
          <SelectTrigger size="sm" className="w-[7.5rem]" aria-label="Suggest renderings in">
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
        <ProviderSelect providers={providers.data} selection={selection} onChange={setChosen} />
      </div>
      <GlossarySuggestions
        key={sampled.id}
        bookId={sampled.id}
        targetLang={targetLang}
        providers={providers.data}
        selection={selection}
        onAdd={onAdd}
      />
    </div>
  );
}
