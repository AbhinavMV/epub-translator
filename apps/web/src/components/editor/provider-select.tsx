import type { ProviderInfo } from "@et/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { envHint, type Selection } from "./model-selection";

export function ProviderSelect({
  providers,
  selection,
  onChange,
}: {
  providers: ProviderInfo[] | undefined;
  selection: Selection | null;
  onChange: (next: Selection) => void;
}) {
  const current = providers?.find((p) => p.id === selection?.provider);
  const models = current
    ? [...new Set([...current.models, selection?.model ?? ""])].filter(Boolean)
    : [];

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={selection?.provider ?? ""}
        onValueChange={(id) => {
          const next = providers?.find((p) => p.id === id);
          if (next) onChange({ provider: next.id, model: next.defaultModel });
        }}
        disabled={!providers}
      >
        <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Provider">
          <SelectValue placeholder="Provider" />
        </SelectTrigger>
        <SelectContent>
          {providers?.map((p) => (
            <SelectItem key={p.id} value={p.id} disabled={!p.configured}>
              <span className="flex flex-col">
                <span>{p.label}</span>
                {!p.configured && (
                  <span className="font-mono text-[10px] text-muted-foreground">{envHint(p)}</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={selection?.model ?? ""}
        onValueChange={(model) => selection && onChange({ provider: selection.provider, model })}
        disabled={!selection}
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
    </div>
  );
}
