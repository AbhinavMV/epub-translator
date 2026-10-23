import type { TranslateMode } from "@et/contracts";

export interface ModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "et.translate-mode";

export function loadMode(storage: ModeStorage): TranslateMode {
  try {
    return storage.getItem(STORAGE_KEY) === "batch" ? "batch" : "live";
  } catch {
    return "live";
  }
}

export function saveMode(storage: ModeStorage, mode: TranslateMode): void {
  try {
    storage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function effectiveMode(mode: TranslateMode, batchSupported: boolean): TranslateMode {
  return mode === "batch" && batchSupported ? "batch" : "live";
}
