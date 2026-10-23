import { useSyncExternalStore } from "react";

export type ThemeName = "light" | "sepia" | "dark" | "system";
export type FontName = "serif" | "sans" | "system";
export type WidthName = "narrow" | "medium" | "wide";
export type ViewMode = "translation" | "interleaved" | "side-by-side";

export interface Prefs {
  theme: ThemeName;
  font: FontName;
  fontSize: number;
  lineHeight: number;
  width: WidthName;
  viewMode: ViewMode;
  railCollapsed: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "light",
  font: "serif",
  fontSize: 19,
  lineHeight: 1.7,
  width: "medium",
  viewMode: "translation",
  railCollapsed: false,
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "et.prefs";

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalize(raw: unknown): Prefs {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: pick(r.theme, ["light", "sepia", "dark", "system"], DEFAULT_PREFS.theme),
    font: pick(r.font, ["serif", "sans", "system"], DEFAULT_PREFS.font),
    fontSize: num(r.fontSize, 14, 28, DEFAULT_PREFS.fontSize),
    lineHeight: num(r.lineHeight, 1.4, 2, DEFAULT_PREFS.lineHeight),
    width: pick(r.width, ["narrow", "medium", "wide"], DEFAULT_PREFS.width),
    viewMode: pick(
      r.viewMode,
      ["translation", "interleaved", "side-by-side"],
      DEFAULT_PREFS.viewMode,
    ),
    railCollapsed: typeof r.railCollapsed === "boolean" ? r.railCollapsed : false,
  };
}

function load(storage: StorageLike | null): Prefs {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return normalize(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function createPrefsStore(storage: StorageLike | null) {
  let state = load(storage);
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<Prefs>) {
      state = normalize({ ...state, ...patch });
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // storage unavailable: keep in-memory value
      }
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type PrefsStore = ReturnType<typeof createPrefsStore>;

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const prefsStore: PrefsStore = createPrefsStore(browserStorage());

export function usePrefs(store: PrefsStore = prefsStore) {
  const prefs = useSyncExternalStore(store.subscribe, store.get);
  return [prefs, store.set] as const;
}
