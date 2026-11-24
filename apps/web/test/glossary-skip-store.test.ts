import { describe, expect, it } from "vitest";
import { createGlossarySkipStore } from "@/lib/glossary-skip-store";
import type { StorageLike } from "@/lib/storage";

function memory() {
  const mem = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  };
  return storage;
}

describe("glossary skip store", () => {
  it("skips no project on a fresh device", () => {
    expect(createGlossarySkipStore(memory()).isSkipped("p1")).toBe(false);
  });

  it("remembers a skip per project across reloads", () => {
    const storage = memory();
    createGlossarySkipStore(storage).skip("p1");
    const reloaded = createGlossarySkipStore(storage);
    expect(reloaded.isSkipped("p1")).toBe(true);
    expect(reloaded.isSkipped("p2")).toBe(false);
  });

  it("tells subscribers when a project is skipped", () => {
    const store = createGlossarySkipStore(memory());
    let calls = 0;
    store.subscribe(() => calls++);
    store.skip("p1");
    expect(calls).toBe(1);
  });

  it("keeps working in memory when storage is blocked", () => {
    const blocked: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    const store = createGlossarySkipStore(blocked);
    store.skip("p1");
    expect(store.isSkipped("p1")).toBe(true);
  });
});
