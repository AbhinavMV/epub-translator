import type { GlossaryEntry, GlossarySamplePlan, ProviderInfo, SampleSize } from "@et/contracts";
import { Loader2, Sparkles, Square } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useGlossaryPlans } from "@/api/queries";
import { chunkSteps, totalPlan } from "@/api/suggestion-run";
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
import { cn } from "@/lib/utils";
import type { Selection } from "./model-selection";

const number = new Intl.NumberFormat("en-US");

const SAMPLE_SIZES: { value: SampleSize; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "volume", label: "Entire volume" },
];

const requestsLabel = (requests: number, chars: number) =>
  `${number.format(requests)} ${requests === 1 ? "request" : "requests"} · ~${number.format(chars)} chars`;

const planLabel = (volumes: number, { requests, chars }: GlossarySamplePlan) =>
  volumes > 1
    ? `${volumes} volumes · ${requestsLabel(requests, chars)}`
    : requestsLabel(requests, chars);

export function suggestionModel(provider: ProviderInfo | undefined, selected: string): string {
  return provider?.termsModel || selected;
}

export function GlossarySuggestions({
  bookIds,
  targetLang,
  providers,
  selection,
  onAdd,
  onRunningChange,
  controls,
}: {
  bookIds: readonly string[];
  targetLang: string;
  providers: ProviderInfo[] | undefined;
  selection: Selection | null;
  onAdd: (entries: GlossaryEntry[]) => void;
  onRunningChange?: (running: boolean) => void;
  controls?: ReactNode;
}) {
  const [size, setSize] = useState<SampleSize>("large");
  const plans = useGlossaryPlans(bookIds, size);
  const { state: run, start, stop, reset } = useSuggestionRun();
  const [modelOverride, setModelOverride] = useState<{ provider: string; model: string } | null>(
    null,
  );
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());
  const suggestions = run.terms;

  useEffect(() => onRunningChange?.(run.running), [run.running, onRunningChange]);
  const usage = run.usage;

  const provider = providers?.find((p) => p.id === selection?.provider);
  const defaultModel = suggestionModel(provider, selection?.model ?? "");
  const model =
    modelOverride && modelOverride.provider === provider?.id ? modelOverride.model : defaultModel;
  const models = [...new Set([defaultModel, ...(provider?.models ?? []), model])].filter(Boolean);

  const begin = () => {
    if (!provider || !model || !plans) return;
    setUnchecked(new Set());
    void start(
      plans.flatMap((p) => chunkSteps(p.bookId, p.requests)),
      {
        provider: provider.id,
        model,
        targetLang,
        sampleSize: size,
      },
    );
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
  const volume = run.step ? bookIds.indexOf(run.step.bookId) + 1 : 0;
  const progress =
    bookIds.length > 1
      ? `Suggesting… volume ${volume} of ${bookIds.length}`
      : run.total > 1
        ? `Suggesting… ${run.done + 1} of ${run.total}`
        : "Suggesting…";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        {controls}
        <SuggestField label="Model">
          {(id) => (
            <Select
              value={model}
              onValueChange={(next) =>
                provider && setModelOverride({ provider: provider.id, model: next })
              }
              disabled={!provider || run.running}
            >
              <SelectTrigger id={id} className={cn(FIELD_TRIGGER, "font-mono text-xs")}>
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
          )}
        </SuggestField>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium">Sample size</span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={size}
          onValueChange={(v) => v && setSize(v as SampleSize)}
          disabled={run.running}
          aria-label="Sample size"
          className="w-full"
        >
          {SAMPLE_SIZES.map((s) => (
            <ToggleGroupItem
              key={s.value}
              value={s.value}
              className="h-auto min-h-9 min-w-0 flex-1 px-2 py-1.5 whitespace-normal"
            >
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="min-h-4 text-xs text-muted-foreground tabular-nums">
          {plans ? planLabel(plans.length, totalPlan(plans)) : ""}
        </p>
      </div>
      {run.error && (
        <p role="alert" className="text-sm break-words text-destructive">
          {run.error}
        </p>
      )}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {usage && (
          <span className="mr-auto font-mono text-xs text-muted-foreground">
            {number.format(usage.inputTokens)} in · {number.format(usage.outputTokens)} out
          </span>
        )}
        {run.running && (
          <Button variant="ghost" onClick={stop}>
            <Square />
            Stop
          </Button>
        )}
        <Button
          className="h-auto min-h-9 whitespace-normal"
          disabled={!provider || !model || !plans || run.running}
          onClick={begin}
        >
          {run.running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {run.running
            ? progress
            : bookIds.length > 1
              ? "Suggest from all volumes"
              : "Suggest from volume"}
        </Button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2 border-t pt-3">
          <ul
            aria-label="Suggested terms"
            className="flex max-h-60 min-w-0 flex-col gap-1 overflow-y-auto text-sm"
          >
            {suggestions.map((s, i) => (
              <li key={s.source}>
                <label className="flex min-w-0 cursor-pointer items-start gap-2 py-0.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!unchecked.has(i)}
                    onChange={() => toggle(i)}
                  />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{s.source}</span> → {s.target}
                    {s.note && <span className="text-muted-foreground"> ({s.note})</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button className="self-start" disabled={selectedCount === 0} onClick={add}>
            Add selected ({selectedCount})
          </Button>
        </div>
      )}
    </div>
  );
}

export const FIELD_TRIGGER = "w-full min-w-0";

export function SuggestField({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
