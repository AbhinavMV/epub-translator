export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `localStorage`, or null where the browser blocks it (private modes, sandboxed frames). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readJson(storage: StorageLike | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

/** Writes are best effort: a full or blocked storage keeps the value in memory only. */
export function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {}
}

export function createListeners() {
  const listeners = new Set<() => void>();
  return {
    notify: () => {
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
