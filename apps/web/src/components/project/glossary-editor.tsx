import {
  type GlossaryConflict,
  type GlossaryEntry,
  type GlossaryRendering,
  MAX_GLOSSARY_ENTRIES,
} from "@et/contracts";
import { Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GlossaryConflictBox } from "./glossary-conflicts";

interface Row {
  key: number;
  source: string;
  target: string;
  note: string;
  suggested?: boolean;
}

type Field = "source" | "target";

const LIMIT_LABEL = MAX_GLOSSARY_ENTRIES.toLocaleString("en-US");
const number = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
let rowKey = 0;
const toRows = (entries: readonly GlossaryEntry[], suggested = false): Row[] =>
  entries.map((e) => ({
    key: rowKey++,
    source: e.source,
    target: e.target,
    note: e.note ?? "",
    ...(suggested ? { suggested } : {}),
  }));

const snapshot = (rows: readonly { source: string; target: string; note?: string }[]) =>
  JSON.stringify(rows.map((r) => [r.source, r.target, r.note ?? ""]));

const toEntries = (rows: readonly Row[]): GlossaryEntry[] =>
  rows
    .filter((r) => r.source.trim() && r.target.trim())
    .map((r) => ({
      source: r.source.trim(),
      target: r.target.trim(),
      ...(r.note.trim() ? { note: r.note.trim() } : {}),
    }));

const matches = (row: Row, query: string) =>
  [row.source, row.target, row.note].some((v) => v.toLowerCase().includes(query));

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] sm:items-center";

export interface GlossaryEditorProps {
  glossary: readonly GlossaryEntry[];
  conflicts: readonly GlossaryConflict[];
  volumeLabel: (rendering: GlossaryRendering) => string;
  saving: boolean;
  onSave: (glossary: GlossaryEntry[], settled: string[]) => Promise<unknown>;
  onDirtyChange?: (dirty: boolean) => void;
  initialSuggesting?: boolean;
  suggestions: (add: (entries: GlossaryEntry[]) => void) => ReactNode;
}

export function GlossaryEditor({
  glossary,
  conflicts,
  volumeLabel,
  saving,
  onSave,
  onDirtyChange,
  initialSuggesting = false,
  suggestions,
}: GlossaryEditorProps) {
  const [saved, setSaved] = useState<readonly GlossaryEntry[]>(glossary);
  const [rows, setRows] = useState(() => toRows(glossary));
  const [settled, setSettled] = useState<readonly string[]>([]);
  const [query, setQuery] = useState("");
  const [suggesting, setSuggesting] = useState(initialSuggesting);
  const [focus, setFocus] = useState<{ key: number; field: Field } | null>(null);
  const idPrefix = useId();
  const inputId = (key: number, field: Field | "note") => `${idPrefix}-${key}-${field}`;

  const baseline = useMemo(() => snapshot(saved), [saved]);
  const dirty = settled.length > 0 || snapshot(rows) !== baseline;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!focus) return;
    document.getElementById(inputId(focus.key, focus.field))?.focus();
    setFocus(null);
  });

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (needle ? rows.filter((r) => matches(r, needle)) : rows),
    [rows, needle],
  );
  const open = conflicts.filter((c) => !settled.includes(c.source));
  const full = rows.length >= MAX_GLOSSARY_ENTRIES;

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addEntry = () => {
    const row: Row = { key: rowKey++, source: "", target: "", note: "" };
    setQuery("");
    setRows((rs) => [...rs, row]);
    setFocus({ key: row.key, field: "source" });
  };

  const addSuggestions = (entries: GlossaryEntry[]) => {
    const known = new Set(rows.map((r) => r.source.trim()));
    const fresh = entries.filter((e) => !known.has(e.source.trim()));
    const added = fresh.slice(0, Math.max(0, MAX_GLOSSARY_ENTRIES - rows.length));
    setQuery("");
    setRows([...toRows(added, true), ...rows]);
    setSuggesting(false);
    const leftOut = fresh.length - added.length;
    if (leftOut > 0) {
      toast.warning(
        `Added ${plural(added.length, "suggestion", "suggestions")}. ${plural(leftOut, "was", "were")} left out: a glossary holds at most ${LIMIT_LABEL} entries.`,
      );
    } else if (added.length > 0) {
      toast.success(
        `Added ${plural(added.length, "suggestion", "suggestions")}. Review them, then save the glossary.`,
      );
    }
  };

  const settle = (source: string, patch: Pick<Row, "target" | "note"> | null) => {
    setSettled((s) => (s.includes(source) ? s : [...s, source]));
    setQuery("");
    const existing = rows.find((r) => r.source.trim() === source);
    if (existing) {
      if (patch)
        setRows((rs) => rs.map((r) => (r.source.trim() === source ? { ...r, ...patch } : r)));
      else setFocus({ key: existing.key, field: "target" });
      return;
    }
    const row: Row = { key: rowKey++, source, target: "", note: "", ...patch };
    setRows((rs) => [row, ...rs]);
    if (!patch) setFocus({ key: row.key, field: "target" });
  };

  const pickRendering = (source: string, rendering: GlossaryRendering) => {
    settle(source, { target: rendering.target, note: rendering.note ?? "" });
    toast.info(`${source} now renders as “${rendering.target}”. Save the glossary to apply it.`);
  };

  const discard = () => {
    setRows(toRows(saved));
    setSettled([]);
  };

  const save = async () => {
    const next = toEntries(rows);
    await onSave(next, [...settled]);
    setSaved(next);
    setRows(toRows(next));
    setSettled([]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_12rem]">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search glossary"
            placeholder="Search glossary"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          aria-expanded={suggesting}
          aria-controls={`${idPrefix}-suggest`}
          onClick={() => setSuggesting((s) => !s)}
        >
          <Sparkles aria-hidden />
          Suggest terms
        </Button>
        <Button variant="outline" disabled={full} onClick={addEntry}>
          <Plus aria-hidden />
          Add entry
        </Button>
      </div>

      <section
        id={`${idPrefix}-suggest`}
        aria-label="Suggest terms"
        hidden={!suggesting}
        className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 flex-1 font-serif text-lg font-medium">
            Suggest terms from the text
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close suggestions"
            onClick={() => setSuggesting(false)}
          >
            <X />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          A cheap model reads a sample and proposes names and terms the glossary lacks, following
          your custom prompt and existing renderings. You review them before anything is saved.
        </p>
        {suggestions(addSuggestions)}
      </section>

      <GlossaryConflictBox
        conflicts={open}
        volumeLabel={volumeLabel}
        onUse={pickRendering}
        onWriteOwn={(source) => settle(source, null)}
      />

      <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
        <div
          aria-hidden
          className={cn(
            ROW_GRID,
            "hidden border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid",
          )}
        >
          <span>Source term</span>
          <span>Rendering</span>
          <span>Note</span>
          <span className="w-9" />
        </div>
        <ul aria-label="Glossary entries" className="flex flex-col">
          {visible.map((r) => (
            <li
              key={r.key}
              data-suggested={r.suggested ? "" : undefined}
              className={cn(
                ROW_GRID,
                "border-b px-3 py-2.5 last:border-b-0 sm:py-2",
                r.suggested && "bg-primary/10",
              )}
            >
              <Input
                id={inputId(r.key, "source")}
                aria-label="Source term"
                placeholder="Source term"
                value={r.source}
                onChange={(e) => update(r.key, { source: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete entry"
                className="col-start-2 row-start-1 sm:col-start-4"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <Trash2 />
              </Button>
              <Input
                id={inputId(r.key, "target")}
                aria-label="Rendering"
                placeholder="Rendering"
                className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
                value={r.target}
                onChange={(e) => update(r.key, { target: e.target.value })}
              />
              <Input
                id={inputId(r.key, "note")}
                aria-label="Note"
                placeholder="Note (optional)"
                className="col-span-2 sm:col-span-1 sm:col-start-3 sm:row-start-1"
                value={r.note}
                onChange={(e) => update(r.key, { note: e.target.value })}
              />
            </li>
          ))}
        </ul>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No glossary entries yet. Use <b className="font-semibold">Suggest terms</b> to pull
            names and terms from the text, or add them yourself.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-sm break-words text-muted-foreground">
            No glossary entries match “{query.trim()}”.
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {number.format(rows.length)} of {LIMIT_LABEL} entries.{" "}
        {full ? "The glossary is full. " : ""}Edits apply from the next chapter; finished volumes
        aren’t retranslated.
      </p>

      {dirty ? (
        <section
          aria-label="Unsaved glossary changes"
          className="sticky bottom-3 z-10 flex min-w-0 flex-wrap items-center gap-2 rounded-xl bg-foreground py-2 pr-2 pl-4 text-background shadow-lg"
        >
          <span className="min-w-0 flex-[1_1_10rem] text-sm">Unsaved glossary changes</span>
          <Button
            variant="ghost"
            className="text-background hover:bg-background/15 hover:text-background"
            disabled={saving}
            onClick={discard}
          >
            Discard
          </Button>
          <Button disabled={saving} onClick={() => void save().catch(() => {})}>
            Save glossary
          </Button>
        </section>
      ) : null}
    </div>
  );
}
