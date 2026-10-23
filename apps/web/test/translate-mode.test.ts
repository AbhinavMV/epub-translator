import { describe, expect, it } from "vitest";
import { effectiveMode, loadMode, saveMode } from "@/lib/translate-mode";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("translate mode", () => {
  it("defaults to live", () => {
    expect(loadMode(memoryStorage())).toBe("live");
  });

  it("round-trips batch through storage", () => {
    const storage = memoryStorage();
    saveMode(storage, "batch");
    expect(loadMode(storage)).toBe("batch");
  });

  it("ignores garbage in storage", () => {
    expect(loadMode(memoryStorage({ "et.translate-mode": "turbo" }))).toBe("live");
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadMode(broken)).toBe("live");
    expect(() => saveMode(broken, "batch")).not.toThrow();
  });

  it("falls back to live when the selected provider has no batch support", () => {
    expect(effectiveMode("batch", false)).toBe("live");
    expect(effectiveMode("batch", true)).toBe("batch");
    expect(effectiveMode("live", true)).toBe("live");
  });
});
