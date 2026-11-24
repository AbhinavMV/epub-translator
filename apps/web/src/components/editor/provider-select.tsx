import type { ProviderInfo } from "@et/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHosted } from "@/keys/hosted-context";
import { modelName } from "@/lib/model-name";
import { envHint, type Selection } from "./model-selection";

export function ProviderSelect({
  providers,
  selection,
  onChange,
  stacked = false,
}: {
  providers: ProviderInfo[] | undefined;
  selection: Selection | null;
  onChange: (next: Selection) => void;
  /** Full-width labelled fields showing model names, for the editor's model sheet. */
  stacked?: boolean;
}) {
  const hosted = useHosted();
  const current = providers?.find((p) => p.id === selection?.provider);
  const models = current
    ? [...new Set([...current.models, selection?.model ?? ""])].filter(Boolean)
    : [];

  const label = (text: string, id: string) =>
    stacked ? (
      <label htmlFor={id} className="text-sm font-medium">
        {text}
      </label>
    ) : null;

  return (
    <div className={stacked ? "grid gap-2" : "flex w-full items-center gap-1.5 sm:w-auto"}>
      {label("Provider", "model-sheet-provider")}
      <Select
        value={selection?.provider ?? ""}
        onValueChange={(id) => {
          const next = providers?.find((p) => p.id === id);
          if (next) onChange({ provider: next.id, model: next.defaultModel });
        }}
        disabled={!providers}
      >
        <SelectTrigger
          id={stacked ? "model-sheet-provider" : undefined}
          size="sm"
          className={stacked ? "w-full" : "min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"}
          aria-label="Provider"
        >
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {providers?.map((p) => (
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
      {label("Model", "model-sheet-model")}
      <Select
        value={selection?.model ?? ""}
        onValueChange={(model) => selection && onChange({ provider: selection.provider, model })}
        disabled={!selection}
      >
        <SelectTrigger
          id={stacked ? "model-sheet-model" : undefined}
          size="sm"
          className={
            stacked ? "w-full" : "min-w-0 flex-1 font-mono text-xs sm:w-[11rem] sm:flex-none"
          }
          aria-label="Model"
        >
          <SelectValue placeholder="Model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m} value={m} className={stacked ? undefined : "font-mono text-xs"}>
              {stacked ? modelName(m) : m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
