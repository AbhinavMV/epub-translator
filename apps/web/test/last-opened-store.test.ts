import { describe, expect, it } from "vitest";
import { createLastOpenedStore } from "@/lib/last-opened-store";
import type { StorageLike } from "@/lib/storage";

function memory() {
  const mem = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  };
  return { mem, storage };
}

const throwing: StorageLike = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

describe("last opened store", () => {
  it("has nothing on a fresh device", () => {
    expect(createLastOpenedStore(memory().storage).get()).toBeNull();
  });

  it("remembers the last book and chapter across reloads", () => {
    const { storage } = memory();
    const store = createLastOpenedStore(storage, () => 1000);
    store.record({ bookId: "b1", chapterId: "c1" });
    store.record({ bookId: "b2", chapterId: "c4" });
    expect(createLastOpenedStore(storage).get()).toEqual({
      bookId: "b2",
      chapterId: "c4",
      openedAt: 1000,
    });
  });

  it("does not notify when the same chapter is recorded again", () => {
    const store = createLastOpenedStore(memory().storage);
    let calls = 0;
    store.subscribe(() => calls++);
    store.record({ bookId: "b1", chapterId: "c1" });
    store.record({ bookId: "b1", chapterId: "c1" });
    expect(calls).toBe(1);
  });

  it("forgets the entry when cleared, for example after its book is deleted", () => {
    const { storage } = memory();
    const store = createLastOpenedStore(storage);
    store.record({ bookId: "b1", chapterId: "c1" });
    store.clear();
    expect(store.get()).toBeNull();
    expect(createLastOpenedStore(storage).get()).toBeNull();
  });

  it("ignores garbage and works when storage is blocked", () => {
    const { mem, storage } = memory();
    mem.set("et.lastOpened", JSON.stringify({ bookId: 3 }));
    expect(createLastOpenedStore(storage).get()).toBeNull();

    const blocked = createLastOpenedStore(throwing);
    expect(() => blocked.record({ bookId: "b1", chapterId: "c1" })).not.toThrow();
    expect(blocked.get()?.bookId).toBe("b1");
  });
});
