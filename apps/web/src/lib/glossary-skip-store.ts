import { useSyncExternalStore } from "react";
import { useDeviceStores } from "./device-stores";
import { createListeners, readJson, type StorageLike, writeJson } from "./storage";

const STORAGE_KEY = "et.glossarySkipped";

export function createGlossarySkipStore(storage: StorageLike | null) {
  const raw = readJson(storage, STORAGE_KEY);
  let skipped = new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []);
  const { notify, subscribe } = createListeners();
  const write = (next: Set<string>) => {
    skipped = next;
    writeJson(storage, STORAGE_KEY, [...next]);
    notify();
  };
  return {
    isSkipped: (projectId: string) => skipped.has(projectId),
    skip(projectId: string) {
      if (!skipped.has(projectId)) write(new Set([...skipped, projectId]));
    },
    clear: () => write(new Set()),
    subscribe,
  };
}

export type GlossarySkipStore = ReturnType<typeof createGlossarySkipStore>;

export function useGlossarySkipped(projectId: string | null | undefined): boolean {
  const store = useDeviceStores().glossarySkip;
  return useSyncExternalStore(store.subscribe, () =>
    projectId ? store.isSkipped(projectId) : false,
  );
}
