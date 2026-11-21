import type { GlossaryEntry, ProviderInfo, SampleSize } from "@et/contracts";
import { Loader2, Sparkles, Square } from "lucide-react";
import { useState } from "react";
import { useGlossaryPlan } from "@/api/queries";
import { chunkSteps } from "@/api/suggestion-run";
import { useSuggestionRun } from "@/api/use-suggestion-run";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Selection } from "./model-selection";

const number = new Intl.NumberFormat("en-US");

const SAMPLE_SIZES: { value: SampleSize; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "volume", label: "Entire volume" },
];

const requestsLabel = (requests: number, chars: number) =>
  `${number.format(requests)} ${requests === 1 ? "request" : "requests"} · ~${number.format(chars)} chars`;

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
  const [size, setSize] = useState<SampleSize>("large");
  const plan = useGlossaryPlan(bookId, size);
  const { state: run, start, stop, reset } = useSuggestionRun();
  const [modelOverride, setModelOverride] = useState<{ provider: string; model: string } | null>(
    null,
  );
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());
  const suggestions = run.terms;
  const usage = run.usage;

  const provider = providers?.find((p) => p.id === selection?.provider);
  const defaultModel = suggestionModel(provider, selection?.model ?? "");
  const model =
    modelOverride && modelOverride.provider === provider?.id ? modelOverride.model : defaultModel;
  const models = [...new Set([defaultModel, ...(provider?.models ?? []), model])].filter(Boolean);

  const begin = () => {
    if (!provider || !model || !plan.data) return;
    setUnchecked(new Set());
    void start(chunkSteps(bookId, plan.data.requests), {
      provider: provider.id,
      model,
      targetLang,
      sampleSize: size,
    });
  };

  const toggle = (index: number) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  const add = () => {
    onAdd(suggestions.filter((_, i) => !unchecked.has(i)));
    reset();
    setUnchecked(new Set());
  };

  const selectedCount = suggestions.length - unchecked.size;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!provider || !model || !plan.data || run.running}
          onClick={begin}
        >
          {run.running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {run.running
            ? run.total > 1
              ? `Suggesting… ${run.done + 1} of ${run.total}`
              : "Suggesting…"
            : "Suggest from book"}
        </Button>
        {run.running && (
          <Button variant="ghost" size="sm" onClick={stop}>
            <Square />
            Stop
          </Button>
        )}
        <Select
          value={model}
          onValueChange={(next) =>
            provider && setModelOverride({ provider: provider.id, model: next })
          }
          disabled={!provider || run.running}
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
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={size}
          onValueChange={(v) => v && setSize(v as SampleSize)}
          disabled={run.running}
          aria-label="Sample size"
        >
          {SAMPLE_SIZES.map((s) => (
            <ToggleGroupItem key={s.value} value={s.value} className="px-2 text-xs">
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {plan.data && (
          <span className="text-xs text-muted-foreground">
            {requestsLabel(plan.data.requests, plan.data.chars)}
          </span>
        )}
      </div>
      {run.error && (
        <p role="alert" className="text-xs text-destructive">
          {run.error}
        </p>
      )}
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
