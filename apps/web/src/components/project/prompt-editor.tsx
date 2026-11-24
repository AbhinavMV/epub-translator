import { DEFAULT_STYLE_GUIDANCE, fixedPromptRules, storedCustomPrompt } from "@et/core";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX = 4000;

export function PromptEditor({
  value,
  saving,
  onSave,
}: {
  value: string | undefined;
  saving: boolean;
  onSave: (prompt: string) => Promise<unknown>;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const rulesId = useId();
  const fieldId = useId();
  const helpId = useId();
  const loaded = value !== undefined;
  const text = draft ?? (value || DEFAULT_STYLE_GUIDANCE);

  const save = async () => {
    const stored = storedCustomPrompt(text);
    try {
      await onSave(stored);
    } catch {
      return;
    }
    setDraft(null);
    toast.success(
      stored
        ? "Custom prompt saved. It applies from the next chapter."
        : "Using the default style guidance from the next chapter.",
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-lg border">
        <Button
          variant="ghost"
          className="h-auto min-h-9 w-full justify-start gap-2 px-3 py-2.5 text-left whitespace-normal coarse:h-auto coarse:min-h-11"
          aria-expanded={rulesOpen}
          aria-controls={rulesId}
          onClick={() => setRulesOpen((open) => !open)}
        >
          <ChevronRight
            aria-hidden
            className={cn("shrink-0 transition-transform", rulesOpen && "rotate-90")}
          />
          <span className="min-w-0">
            Fixed rules
            <span className="font-normal text-muted-foreground">
              {" "}
              · fidelity and format, used by every translation and can’t be edited
            </span>
          </span>
        </Button>
        {rulesOpen ? (
          <section
            id={rulesId}
            aria-label="Fixed rules"
            className="min-w-0 border-t bg-muted/50 px-3 py-3"
          >
            <pre className="font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">
              {fixedPromptRules("source-language", "the target language")}
            </pre>
          </section>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <label htmlFor={fieldId} className="text-sm font-medium">
            Custom prompt
          </label>
          {loaded ? (
            <span className="min-w-0 text-xs text-muted-foreground">
              {value ? "Custom prompt set" : "Using the default style guidance"}
            </span>
          ) : null}
        </div>
        <Textarea
          id={fieldId}
          maxLength={MAX}
          value={loaded ? text : ""}
          disabled={!loaded}
          onChange={(e) => setDraft(e.target.value)}
          aria-describedby={helpId}
          className="min-h-48 min-w-0"
        />
        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <p id={helpId} className="min-w-0 flex-[1_1_16rem]">
            This is the prompt in force for every volume of this project. It takes the place of the
            default style guidance, such as tone, honorifics or how to render names. Changes apply
            from the next chapter translated.
          </p>
          <p className="font-mono">
            {text.length} / {MAX}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={!loaded || text === DEFAULT_STYLE_GUIDANCE}
          onClick={() => setDraft(DEFAULT_STYLE_GUIDANCE)}
        >
          Reset to default
        </Button>
        <Button className="ml-auto" disabled={!loaded || saving} onClick={save}>
          Save custom prompt
        </Button>
      </div>
    </div>
  );
}
