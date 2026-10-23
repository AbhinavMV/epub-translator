import type { BookSettings, GlossaryEntry } from "@et/contracts";
import { BookA, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Row {
  key: number;
  source: string;
  target: string;
  note: string;
}

const MAX_ENTRIES = 500;
let rowKey = 0;
const toRows = (entries: GlossaryEntry[]): Row[] =>
  entries.map((e) => ({ key: rowKey++, source: e.source, target: e.target, note: e.note ?? "" }));

export function GlossaryDialog({
  settings,
  saving,
  onSave,
}: {
  settings: BookSettings | undefined;
  saving: boolean;
  onSave: (glossary: GlossaryEntry[]) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const count = settings?.glossary.length ?? 0;
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async () => {
    const glossary = rows
      .filter((r) => r.source.trim() && r.target.trim())
      .map((r) => ({
        source: r.source.trim(),
        target: r.target.trim(),
        ...(r.note.trim() ? { note: r.note.trim() } : {}),
      }));
    await onSave(glossary);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setRows(toRows(settings?.glossary ?? []));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!settings}>
          <BookA />
          <span className="hidden sm:inline">Glossary</span>
          {count > 0 && (
            <span className="rounded-sm bg-primary/15 px-1 font-mono text-[10px] text-primary">
              {count}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Glossary</DialogTitle>
          <DialogDescription>
            Terms the model must translate consistently. Applied only when the source term appears.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] pr-3">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 pb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            <span>Source</span>
            <span>Target</span>
            <span>Note</span>
            <span className="w-8" />
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input
                  aria-label="Source term"
                  value={r.source}
                  onChange={(e) => update(r.key, { source: e.target.value })}
                />
                <Input
                  aria-label="Target term"
                  value={r.target}
                  onChange={(e) => update(r.key, { target: e.target.value })}
                />
                <Input
                  aria-label="Note"
                  value={r.note}
                  onChange={(e) => update(r.key, { note: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove entry"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No terms yet. Add character names and recurring terms.
              </p>
            )}
          </div>
        </ScrollArea>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={rows.length >= MAX_ENTRIES}
          onClick={() =>
            setRows((rs) => [...rs, { key: rowKey++, source: "", target: "", note: "" }])
          }
        >
          <Plus /> Add term
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            Save glossary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
