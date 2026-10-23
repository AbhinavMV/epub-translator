import type { GlossaryEntry, ProviderInfo, Usage } from "@et/contracts";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSuggestGlossary } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Selection } from "./model-selection";

const number = new Intl.NumberFormat("en-US");

export function suggestionModel(provider: ProviderInfo | undefined, selected: string): string {
  return provider?.termsModel || selected;
}

export function GlossarySuggestions({
  bookId,
  targetLang,
  providers,
  selection,
  onAdd,
}: {
  bookId: string;
  targetLang: string;
  providers: ProviderInfo[] | undefined;
  selection: Selection | null;
  onAdd: (entries: GlossaryEntry[]) => void;
}) {
  const suggest = useSuggestGlossary(bookId);
  const [modelOverride, setModelOverride] = useState<{ provider: string; model: string } | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<GlossaryEntry[]>([]);
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());
  const [usage, setUsage] = useState<Usage | null>(null);

  const provider = providers?.find((p) => p.id === selection?.provider);
  const defaultModel = suggestionModel(provider, selection?.model ?? "");
  const model =
    modelOverride && modelOverride.provider === provider?.id ? modelOverride.model : defaultModel;
  const models = [...new Set([defaultModel, ...(provider?.models ?? []), model])].filter(Boolean);

  const run = async () => {
    if (!provider || !model) return;
    const result = await suggest.mutateAsync({ provider: provider.id, model, targetLang });
    setSuggestions(result.terms);
    setUnchecked(new Set());
    setUsage(result.usage);
  };

  const toggle = (index: number) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  const add = () => {
    onAdd(suggestions.filter((_, i) => !unchecked.has(i)));
    setSuggestions([]);
    setUsage(null);
  };

  const selectedCount = suggestions.length - unchecked.size;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!provider || !model || suggest.isPending}
          onClick={() => run().catch(() => undefined)}
        >
          {suggest.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {suggest.isPending ? "Suggesting…" : "Suggest from book"}
        </Button>
        <Select
          value={model}
          onValueChange={(next) =>
            provider && setModelOverride({ provider: provider.id, model: next })
          }
          disabled={!provider || suggest.isPending}
        >
          <SelectTrigger size="sm" className="w-[11rem] font-mono text-xs" aria-label="Model">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m} value={m} className="font-mono text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {usage && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {number.format(usage.inputTokens)} in · {number.format(usage.outputTokens)} out
          </span>
        )}
      </div>
      {suggestions.length > 0 && (
        <>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
            {suggestions.map((s, i) => (
              <li key={s.source}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!unchecked.has(i)}
                    onChange={() => toggle(i)}
                  />
                  <span>
                    <span className="font-medium">{s.source}</span> → {s.target}
                    {s.note && <span className="text-muted-foreground"> ({s.note})</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button size="sm" className="self-start" disabled={selectedCount === 0} onClick={add}>
            Add selected ({selectedCount})
          </Button>
        </>
      )}
    </div>
  );
}
