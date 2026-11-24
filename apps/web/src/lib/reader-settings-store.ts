import { useSyncExternalStore } from "react";
import { useDeviceStores } from "./device-stores";
import { createListeners, readJson, type StorageLike, writeJson } from "./storage";

export type ThemeName = "light" | "sepia" | "dark" | "system";
export type FontName = "serif" | "sans" | "system";
export type WidthName = "narrow" | "medium" | "wide";
export type ViewMode = "translation" | "interleaved" | "side-by-side";

export type Layout = "scroll" | "paged";

export interface Prefs {
  theme: ThemeName;
  font: FontName;
  fontSize: number;
  lineHeight: number;
  width: WidthName;
  viewMode: ViewMode;
  layout: Layout;
  railCollapsed: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "light",
  font: "serif",
  fontSize: 19,
  lineHeight: 1.7,
  width: "medium",
  viewMode: "translation",
  layout: "scroll",
  railCollapsed: false,
};

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
    layout: pick(r.layout, ["scroll", "paged"], DEFAULT_PREFS.layout),
    railCollapsed: typeof r.railCollapsed === "boolean" ? r.railCollapsed : false,
  };
}

export function createPrefsStore(storage: StorageLike | null) {
  let state = normalize(readJson(storage, STORAGE_KEY));
  const { notify, subscribe } = createListeners();
  return {
    get: () => state,
    set(patch: Partial<Prefs>) {
      state = normalize({ ...state, ...patch });
      writeJson(storage, STORAGE_KEY, state);
      notify();
    },
    subscribe,
  };
}

export type PrefsStore = ReturnType<typeof createPrefsStore>;

export function usePrefs() {
  const store = useDeviceStores().prefs;
  const prefs = useSyncExternalStore(store.subscribe, store.get);
  return [prefs, store.set] as const;
}
