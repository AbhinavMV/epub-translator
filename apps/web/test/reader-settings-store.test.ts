import { describe, expect, it } from "vitest";
import { createPrefsStore, DEFAULT_PREFS, type StorageLike } from "@/lib/reader-settings-store";

const throwing: StorageLike = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

function memory() {
  const mem = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  };
  return { mem, storage };
}

describe("prefs store", () => {
  it("falls back to defaults when localStorage throws", () => {
    const store = createPrefsStore(throwing);
    expect(store.get()).toEqual(DEFAULT_PREFS);
    expect(() => store.set({ fontSize: 22 })).not.toThrow();
    expect(store.get().fontSize).toBe(22);
  });

  it("clamps out-of-range and ignores garbage values", () => {
    const { mem, storage } = memory();
    mem.set(
      "et.prefs",
      JSON.stringify({ fontSize: 99, lineHeight: "x", theme: "neon", font: "sans" }),
    );
    const prefs = createPrefsStore(storage).get();
    expect(prefs.fontSize).toBe(28);
    expect(prefs.lineHeight).toBe(DEFAULT_PREFS.lineHeight);
    expect(prefs.theme).toBe(DEFAULT_PREFS.theme);
    expect(prefs.font).toBe("sans");
  });

  it("persists and notifies subscribers", () => {
    const { mem, storage } = memory();
    const store = createPrefsStore(storage);
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ theme: "dark" });
    expect(calls).toBe(1);
    expect(JSON.parse(mem.get("et.prefs") ?? "{}").theme).toBe("dark");
  });
});
