import { DEFAULT_STYLE_GUIDANCE, fixedPromptRules, storedCustomPrompt } from "@et/core";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const MAX = 4000;

export function PromptDialog({
  value,
  disabled,
  saving,
  onSave,
}: {
  value: string | undefined;
  disabled: boolean;
  saving: boolean;
  onSave: (prompt: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value || DEFAULT_STYLE_GUIDANCE);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <MessageSquareText />
          Custom prompt
          {value ? <span className="size-1.5 rounded-full bg-primary" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Custom prompt</DialogTitle>
          <DialogDescription>
            The custom prompt takes the place of the default style guidance for every volume in this
            project, such as tone, honorifics or how to render names. The fidelity and format rules
            always apply.
          </DialogDescription>
        </DialogHeader>
        <section
          aria-label="Fixed rules"
          className="max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-3"
        >
          <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {fixedPromptRules("source-language", "the target language")}
          </pre>
        </section>
        <Textarea
          rows={6}
          maxLength={MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Keep honorifics (-san, -chan). Use a light, conversational tone."
          aria-label="Custom prompt"
        />
        <p className="text-right font-mono text-xs text-muted-foreground">
          {draft.length} / {MAX}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              await onSave(storedCustomPrompt(draft));
              setOpen(false);
            }}
          >
            Save custom prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
