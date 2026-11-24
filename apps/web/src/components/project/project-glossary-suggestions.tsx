import type { BookSummary, GlossaryEntry } from "@et/contracts";
import { TARGET_LANGUAGES } from "@et/contracts";
import { compareVolumes } from "@et/core";
import { useState } from "react";
import { useProviders } from "@/api/queries";
import {
  FIELD_TRIGGER,
  GlossarySuggestions,
  SuggestField,
} from "@/components/editor/glossary-suggestions";
import { envHint, resolveSelection, type Selection } from "@/components/editor/model-selection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHosted } from "@/keys/hosted-context";

const ALL_VOLUMES = "__all-volumes__";

const volumeLabel = (book: BookSummary) =>
  book.volumeNumber === null || book.volumeNumber === undefined
    ? book.title
    : `Vol. ${book.volumeNumber}`;

export function ProjectGlossarySuggestions({
  books,
  onAdd,
  readAll = false,
}: {
  books: BookSummary[];
  onAdd: (entries: GlossaryEntry[]) => void;
  readAll?: boolean;
}) {
  const providers = useProviders();
  const hosted = useHosted();
  const [bookId, setBookId] = useState<string | null>(
    readAll && books.length > 1 ? ALL_VOLUMES : null,
  );
  const [targetLang, setTargetLang] = useState("en");
  const [chosen, setChosen] = useState<Selection | null>(null);
  const [running, setRunning] = useState(false);
  const selection = chosen ?? resolveSelection(undefined, providers.data);
  const volumes = [...books].sort(compareVolumes);
  const latest = books.at(-1);
  const sampled = bookId === ALL_VOLUMES ? null : (books.find((b) => b.id === bookId) ?? latest);

  if (!latest) {
    return (
      <p className="text-sm text-muted-foreground">Upload a volume to suggest terms from it.</p>
    );
  }

  const controls = (
    <>
      <SuggestField label="Read from">
        {(id) => (
          <Select value={sampled?.id ?? ALL_VOLUMES} onValueChange={setBookId} disabled={running}>
            <SelectTrigger id={id} className={FIELD_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {books.length > 1 && <SelectItem value={ALL_VOLUMES}>All volumes</SelectItem>}
              {books.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {volumeLabel(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SuggestField>
      <SuggestField label="Suggest renderings in">
        {(id) => (
          <Select value={targetLang} onValueChange={setTargetLang} disabled={running}>
            <SelectTrigger id={id} className={FIELD_TRIGGER}>
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
        )}
      </SuggestField>
      <SuggestField label="Provider">
        {(id) => (
          <Select
            value={selection?.provider ?? ""}
            onValueChange={(next) => {
              const p = providers.data?.find((x) => x.id === next);
              if (p) setChosen({ provider: p.id, model: p.defaultModel });
            }}
            disabled={!providers.data || running}
          >
            <SelectTrigger id={id} className={FIELD_TRIGGER}>
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.data?.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={!p.configured}>
                  <span className="flex flex-col">
                    <span>{p.label}</span>
                    {!p.configured && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {hosted ? "Add a key under Settings → API keys" : envHint(p)}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SuggestField>
    </>
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
