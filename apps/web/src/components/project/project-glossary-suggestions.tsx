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

const ALL_VOLUMES = "__all-volumes__";

const volumeOrder = (book: BookSummary) => book.volumeNumber ?? Number.MAX_VALUE;
const byVolume = (a: BookSummary, b: BookSummary) => volumeOrder(a) - volumeOrder(b);

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
  const [running, setRunning] = useState(false);
  const selection = chosen ?? resolveSelection(undefined, providers.data);
  const volumes = [...books].sort(byVolume);
  const latest = books.at(-1);
  const sampled = bookId === ALL_VOLUMES ? null : (books.find((b) => b.id === bookId) ?? latest);

  if (!latest) return null;

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={sampled?.id ?? ALL_VOLUMES} onValueChange={setBookId} disabled={running}>
        <SelectTrigger size="sm" className="w-[9rem]" aria-label="Volume to sample">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {books.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {volumeLabel(b)}
            </SelectItem>
          ))}
          {books.length > 1 && <SelectItem value={ALL_VOLUMES}>All volumes</SelectItem>}
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
  );

  return (
    <GlossarySuggestions
      key={sampled?.id ?? ALL_VOLUMES}
      bookIds={sampled ? [sampled.id] : volumes.map((b) => b.id)}
      targetLang={targetLang}
      providers={providers.data}
      selection={selection}
      onAdd={onAdd}
      onRunningChange={setRunning}
      controls={controls}
    />
  );
}
