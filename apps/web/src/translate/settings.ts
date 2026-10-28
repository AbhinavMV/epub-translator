const CONCURRENCY_KEY = "et.concurrency";
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 4;
export const DEFAULT_CONCURRENCY_SETTING = 2;

export function readConcurrency(storage: Pick<Storage, "getItem">): number {
  try {
    const n = Number(storage.getItem(CONCURRENCY_KEY));
    if (Number.isInteger(n) && n >= MIN_CONCURRENCY && n <= MAX_CONCURRENCY) return n;
  } catch {
    // storage may be unavailable (private mode); fall through to the default
  }
  return DEFAULT_CONCURRENCY_SETTING;
}

export function saveConcurrency(storage: Pick<Storage, "setItem">, value: number): void {
  try {
    storage.setItem(CONCURRENCY_KEY, String(value));
  } catch {
    // best effort
  }
}
