import { useEffect, useSyncExternalStore } from "react";
import { useDeviceStores } from "./device-stores";
import { createListeners, readJson, type StorageLike, writeJson } from "./storage";

export interface LastOpened {
  bookId: string;
  chapterId: string;
  openedAt: number;
}

const STORAGE_KEY = "et.lastOpened";

function parse(raw: unknown): LastOpened | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.bookId !== "string" || typeof r.chapterId !== "string") return null;
  return {
    bookId: r.bookId,
    chapterId: r.chapterId,
    openedAt: typeof r.openedAt === "number" ? r.openedAt : 0,
  };
}

export function createLastOpenedStore(storage: StorageLike | null, now: () => number = Date.now) {
  let state = parse(readJson(storage, STORAGE_KEY));
  const { notify, subscribe } = createListeners();
  const write = (next: LastOpened | null) => {
    state = next;
    writeJson(storage, STORAGE_KEY, next);
    notify();
  };
  return {
    get: () => state,
    record({ bookId, chapterId }: { bookId: string; chapterId: string }) {
      if (state?.bookId === bookId && state.chapterId === chapterId) return;
      write({ bookId, chapterId, openedAt: now() });
    },
    clear: () => write(null),
    subscribe,
  };
}

export type LastOpenedStore = ReturnType<typeof createLastOpenedStore>;

export function useLastOpened(): LastOpened | null {
  const store = useDeviceStores().lastOpened;
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useRecordLastOpened(bookId: string | undefined, chapterId: string | undefined) {
  const store = useDeviceStores().lastOpened;
  useEffect(() => {
    if (bookId && chapterId) store.record({ bookId, chapterId });
  }, [bookId, chapterId, store]);
}
