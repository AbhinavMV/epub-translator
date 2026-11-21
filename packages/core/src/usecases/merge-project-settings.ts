import {
  type GlossaryConflict,
  type GlossaryEntry,
  type GlossaryRendering,
  type LegacyBookTerms,
  MAX_GLOSSARY_ENTRIES,
  type ProjectSettings,
} from "@et/contracts";
import { compareVolumes } from "../domain/project.ts";
import type { BookRepository, BookSettingsRepository, ProjectRepository } from "../ports/stores.ts";

export interface MergeSourceVolume {
  bookId: string;
  volumeNumber: number | null;
  createdAt: string;
  legacy: LegacyBookTerms;
}

function clean(entry: GlossaryEntry): GlossaryEntry | null {
  const source = entry.source.trim();
  const target = entry.target.trim();
  if (!source || !target) return null;
  const note = entry.note?.trim();
  return { source, target, ...(note ? { note } : {}) };
}

export function planProjectSettings(volumes: readonly MergeSourceVolume[]): ProjectSettings {
  const ordered = [...volumes].sort(compareVolumes);
  const renderings = new Map<string, GlossaryRendering[]>();
  let customPrompt = "";

  for (const volume of ordered) {
    if (volume.legacy.customPrompt.trim()) customPrompt = volume.legacy.customPrompt.trim();
    for (const raw of volume.legacy.glossary) {
      const entry = clean(raw);
      if (!entry) continue;
      const { source, ...rendering } = entry;
      const list = renderings.get(source) ?? [];
      list.push({ ...rendering, bookId: volume.bookId, volumeNumber: volume.volumeNumber });
      renderings.set(source, list);
    }
  }

  const glossary: GlossaryEntry[] = [];
  const glossaryConflicts: GlossaryConflict[] = [];
  for (const [source, list] of renderings) {
    const inForce = list[list.length - 1] as GlossaryRendering;
    glossary.push({
      source,
      target: inForce.target,
      ...(inForce.note ? { note: inForce.note } : {}),
    });
    const alternatives = new Map<string, GlossaryRendering>();
    for (const r of list.slice(0, -1).reverse()) {
      if (r.target !== inForce.target && !alternatives.has(r.target)) alternatives.set(r.target, r);
    }
    if (alternatives.size > 0) {
      glossaryConflicts.push({ source, inForce, alternatives: [...alternatives.values()] });
    }
  }
  return { customPrompt, glossary, glossaryConflicts };
}

export interface MergeDeps {
  books: BookRepository;
  projects: ProjectRepository;
  settings: BookSettingsRepository;
}

export type MergeProject =
  | { projectId: string; name: string; status: "skip" }
  | { projectId: string; name: string; status: "merge" | "too-large"; settings: ProjectSettings };

export interface MergePlan {
  projects: MergeProject[];
  unplaced: { bookId: string; title: string }[];
}

export async function mergeProjectSettings(
  deps: MergeDeps,
  options: { apply: boolean },
): Promise<MergePlan> {
  const unplaced = (await deps.books.list())
    .filter((b) => !b.projectId)
    .map((b) => ({ bookId: b.id, title: b.title }));
  const write = options.apply && unplaced.length === 0;
  const projects: MergeProject[] = [];
  for (const project of [...(await deps.projects.list())].reverse()) {
    const base = { projectId: project.id, name: project.name };
    if (await deps.projects.getSettings(project.id)) {
      projects.push({ ...base, status: "skip" });
      continue;
    }
    const volumes: MergeSourceVolume[] = [];
    for (const book of await deps.books.listByProject(project.id)) {
      volumes.push({
        bookId: book.id,
        volumeNumber: book.volumeNumber,
        createdAt: book.createdAt,
        legacy: (await deps.settings.getLegacyTerms(book.id)) ?? { customPrompt: "", glossary: [] },
      });
    }
    const settings = planProjectSettings(volumes);
    const status = settings.glossary.length > MAX_GLOSSARY_ENTRIES ? "too-large" : "merge";
    if (write && status === "merge") await deps.projects.putSettings(project.id, settings);
    projects.push({ ...base, status, settings });
  }
  return { projects, unplaced };
}

const vol = (r: GlossaryRendering) => `vol ${r.volumeNumber ?? "?"}`;

export function describeMergePlan(plan: MergePlan): string[] {
  const lines: string[] = [];
  for (const project of plan.projects) {
    if (project.status === "skip") {
      lines.push(
        `Project "${project.name}" (${project.projectId}) already has a glossary; skipped.`,
      );
      continue;
    }
    const { settings } = project;
    lines.push(
      project.status === "too-large"
        ? `Project "${project.name}" (${project.projectId}) NOT merged: ${settings.glossary.length} entries exceed the ${MAX_GLOSSARY_ENTRIES}-entry limit.`
        : `Project "${project.name}" (${project.projectId}): ${settings.glossary.length} glossary entries, ${settings.glossaryConflicts.length} conflict(s).`,
    );
    if (settings.customPrompt)
      lines.push(`  prompt: ${settings.customPrompt.replace(/\s+/g, " ")}`);
    for (const entry of settings.glossary) {
      lines.push(`  ${entry.source} → ${entry.target}${entry.note ? `  (${entry.note})` : ""}`);
    }
    for (const conflict of settings.glossaryConflicts) {
      const others = conflict.alternatives.map((a) => `${a.target} (${vol(a)})`).join(", ");
      lines.push(
        `  conflict ${conflict.source}: ${conflict.inForce.target} (${vol(conflict.inForce)}) in force; also ${others}`,
      );
    }
  }
  if (plan.unplaced.length > 0) {
    lines.push(
      `Nothing is merged for this owner while ${plan.unplaced.length} book(s) have no project; run backfill:projects first, then re-run this:`,
    );
    for (const book of plan.unplaced) lines.push(`  ${book.title}  [${book.bookId}]`);
  }
  return lines;
}
