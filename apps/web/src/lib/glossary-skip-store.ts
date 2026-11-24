import { useSyncExternalStore } from "react";
import type { StorageLike } from "./reader-settings-store";

const STORAGE_KEY = "et.glossarySkipped";

function parse(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  try {
    const raw: unknown = JSON.parse(text);
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Projects whose reader chose to translate without a glossary, on this device. */
export function createGlossarySkipStore(storage: StorageLike | null) {
  let skipped: Set<string>;
  try {
    skipped = parse(storage?.getItem(STORAGE_KEY));
  } catch {
    skipped = new Set();
  }
  const listeners = new Set<() => void>();
  const write = (next: Set<string>) => {
    skipped = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {}
    for (const l of listeners) l();
  };
  return {
    isSkipped: (projectId: string) => skipped.has(projectId),
    skip(projectId: string) {
      if (!skipped.has(projectId)) write(new Set([...skipped, projectId]));
    },
    clear: () => write(new Set()),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type GlossarySkipStore = ReturnType<typeof createGlossarySkipStore>;

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const glossarySkipStore: GlossarySkipStore = createGlossarySkipStore(browserStorage());

export function useGlossarySkipped(
  projectId: string | null | undefined,
  store: GlossarySkipStore = glossarySkipStore,
): boolean {
  return useSyncExternalStore(store.subscribe, () =>
    projectId ? store.isSkipped(projectId) : false,
  );
}
