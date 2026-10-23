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
        if (next) setDraft(value ?? "");
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <MessageSquareText />
          <span className="hidden sm:inline">Edit prompt</span>
          {value ? <span className="size-1.5 rounded-full bg-primary" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit prompt</DialogTitle>
          <DialogDescription>
            Extra instructions appended to the translation prompt for this book, such as tone,
            honorifics or how to render names.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={9}
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
              await onSave(draft.trim());
              setOpen(false);
            }}
          >
            Save prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
