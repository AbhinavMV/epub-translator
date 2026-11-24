import { useEffect, useSyncExternalStore } from "react";
import type { StorageLike } from "./reader-settings-store";

export interface LastOpened {
  bookId: string;
  chapterId: string;
  openedAt: number;
}

const STORAGE_KEY = "et.lastOpened";

function parse(text: string | null | undefined): LastOpened | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (typeof raw.bookId !== "string" || typeof raw.chapterId !== "string") return null;
    return {
      bookId: raw.bookId,
      chapterId: raw.chapterId,
      openedAt: typeof raw.openedAt === "number" ? raw.openedAt : 0,
    };
  } catch {
    return null;
  }
}

export function createLastOpenedStore(storage: StorageLike | null, now: () => number = Date.now) {
  let state: LastOpened | null;
  try {
    state = parse(storage?.getItem(STORAGE_KEY));
  } catch {
    state = null;
  }
  const listeners = new Set<() => void>();
  const write = (next: LastOpened | null) => {
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, next ? JSON.stringify(next) : "");
    } catch {
      // storage unavailable: keep in-memory value
    }
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    record({ bookId, chapterId }: { bookId: string; chapterId: string }) {
      if (state?.bookId === bookId && state.chapterId === chapterId) return;
      write({ bookId, chapterId, openedAt: now() });
    },
    clear: () => write(null),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type LastOpenedStore = ReturnType<typeof createLastOpenedStore>;

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const lastOpenedStore: LastOpenedStore = createLastOpenedStore(browserStorage());

export function useLastOpened(store: LastOpenedStore = lastOpenedStore): LastOpened | null {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Records the chapter once both ids are known; pass undefined while the book is loading. */
export function useRecordLastOpened(
  bookId: string | undefined,
  chapterId: string | undefined,
  store: LastOpenedStore = lastOpenedStore,
) {
  useEffect(() => {
    if (bookId && chapterId) store.record({ bookId, chapterId });
  }, [bookId, chapterId, store]);
}
