import { describe, expect, it } from "vitest";
import { createRenameOfferStore } from "@/lib/rename-offer-store";
import type { StorageLike } from "@/lib/storage";

function memory() {
  const mem = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
  };
  return storage;
}

describe("rename offer store", () => {
  it("remembers Not now per project and title across reloads", () => {
    const storage = memory();
    createRenameOfferStore(storage).dismiss("p1", "Wandering Witch");
    const reloaded = createRenameOfferStore(storage);
    expect(reloaded.isDismissed("p1", "Wandering Witch")).toBe(true);
    expect(reloaded.isDismissed("p1", "The Journey of Elaina")).toBe(false);
    expect(reloaded.isDismissed("p2", "Wandering Witch")).toBe(false);
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
    const store = createRenameOfferStore(blocked);
    store.dismiss("p1", "Wandering Witch");
    expect(store.isDismissed("p1", "Wandering Witch")).toBe(true);
  });
});
