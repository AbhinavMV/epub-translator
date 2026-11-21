import { type GlossaryEntry, MAX_GLOSSARY_ENTRIES } from "@et/contracts";
import { BookA, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import { GlossaryConflictList, type GlossaryConflictsProps } from "./glossary-conflicts";

interface Row {
  key: number;
  source: string;
  target: string;
  note: string;
}

const MAX_ENTRIES = MAX_GLOSSARY_ENTRIES;
let rowKey = 0;
const toRows = (entries: GlossaryEntry[]): Row[] =>
  entries.map((e) => ({ key: rowKey++, source: e.source, target: e.target, note: e.note ?? "" }));

export function GlossaryDialog({
  glossary,
  saving,
  onSave,
  suggestions,
  conflicts,
}: {
  glossary: GlossaryEntry[] | undefined;
  saving: boolean;
  onSave: (glossary: GlossaryEntry[]) => Promise<unknown>;
  suggestions: (add: (entries: GlossaryEntry[]) => void) => ReactNode;
  conflicts?: Omit<GlossaryConflictsProps, "onResolve"> & {
    onResolve: (source: string, target: string) => Promise<GlossaryEntry | undefined>;
  };
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const conflictCount = conflicts?.conflicts.length ?? 0;
  const showConflicts = conflictsOnly && conflictCount > 0;

  const resolve = async (source: string, target: string) => {
    const entry = await conflicts?.onResolve(source, target);
    if (!entry) return;
    setRows((rs) =>
      rs.map((r) =>
        r.source.trim() === source ? { ...r, target: entry.target, note: entry.note ?? "" } : r,
      ),
    );
  };

  const count = glossary?.length ?? 0;
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addSuggestions = (entries: GlossaryEntry[]) =>
    setRows((rs) => {
      const known = new Set(rs.map((r) => r.source.trim()));
      const fresh = entries.filter((e) => !known.has(e.source.trim()));
      return [...rs, ...toRows(fresh)].slice(0, MAX_ENTRIES);
    });

  const submit = async () => {
    const next = rows
      .filter((r) => r.source.trim() && r.target.trim())
      .map((r) => ({
        source: r.source.trim(),
        target: r.target.trim(),
        ...(r.note.trim() ? { note: r.note.trim() } : {}),
      }));
    await onSave(next);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setRows(toRows(glossary ?? []));
          setConflictsOnly(false);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!glossary}>
          <BookA />
          Glossary
          {count > 0 && (
            <span className="rounded-sm bg-primary/15 px-1 font-mono text-[10px] text-foreground">
              {count}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Glossary</DialogTitle>
          <DialogDescription>
            Glossary entries every volume in this project must render the same way. An entry applies
            only where its source term appears.
          </DialogDescription>
        </DialogHeader>
        {suggestions(addSuggestions)}
        {conflictCount > 0 && (
          <div className="flex gap-2">
            <Button
              variant={showConflicts ? "outline" : "secondary"}
              size="sm"
              aria-pressed={!showConflicts}
              onClick={() => setConflictsOnly(false)}
            >
              All entries
            </Button>
            <Button
              variant={showConflicts ? "secondary" : "outline"}
              size="sm"
              aria-pressed={showConflicts}
              onClick={() => setConflictsOnly(true)}
            >
              {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
            </Button>
          </div>
        )}
        {showConflicts && conflicts ? (
          <ScrollArea className="max-h-[50vh] pr-3">
            <p className="pb-3 text-sm text-muted-foreground">
              Merged volumes gave these entries different renderings. Translation uses the rendering
              in force until you pick one.
            </p>
            <GlossaryConflictList
              conflicts={conflicts.conflicts}
              volumeLabel={conflicts.volumeLabel}
              onResolve={resolve}
            />
          </ScrollArea>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-3">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase sm:grid-cols-[1fr_1fr_1fr_auto]">
              <span>Source</span>
              <span>Rendering</span>
              <span className="hidden sm:block">Note</span>
              <span className="w-8" />
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b pb-2 last:border-b-0 sm:grid-cols-[1fr_1fr_1fr_auto] sm:border-b-0 sm:pb-0"
                >
                  <Input
                    aria-label="Source term"
                    value={r.source}
                    onChange={(e) => update(r.key, { source: e.target.value })}
                  />
                  <Input
                    aria-label="Rendering"
                    value={r.target}
                    onChange={(e) => update(r.key, { target: e.target.value })}
                  />
                  <Input
                    aria-label="Note"
                    placeholder="Note"
                    className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto sm:placeholder:text-transparent"
                    value={r.note}
                    onChange={(e) => update(r.key, { note: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove entry"
                    className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No glossary entries yet. Add character names and other recurring source terms.
                </p>
              )}
            </div>
          </ScrollArea>
        )}
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={showConflicts || rows.length >= MAX_ENTRIES}
          onClick={() =>
            setRows((rs) => [...rs, { key: rowKey++, source: "", target: "", note: "" }])
          }
        >
          <Plus /> Add entry
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
