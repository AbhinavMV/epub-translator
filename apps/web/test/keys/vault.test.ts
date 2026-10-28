import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEnvelopeStore } from "@/keys/memory-store";
import { Vault, VaultAlreadyInitializedError, VaultError } from "@/keys/vault";

const KEY = "sk-ant-fake-0123456789abcdefWXYZ";
const OTHER = "sk-fake-openai-9876543210zyxwVUTS";
const PASS = "correct horse battery staple";
const ITER = 1000;

let store: MemoryEnvelopeStore;
let now: number;

function makeVault(options: { idleMs?: number; iterations?: number } = {}) {
  return new Vault({
    store,
    scope: "user-1",
    iterations: options.iterations ?? ITER,
    idleMs: options.idleMs ?? 30 * 60_000,
    now: () => now,
  });
}

async function unlockedWithKey(vault = makeVault()) {
  await vault.load();
  await vault.initialize(PASS);
  await vault.setKey("anthropic", KEY);
  return vault;
}

beforeEach(() => {
  store = new MemoryEnvelopeStore();
  now = 1_000_000;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("vault", () => {
  it("round-trips a key through lock and unlock", async () => {
    const vault = await unlockedWithKey();
    expect(vault.getKey("anthropic")).toBe(KEY);
    vault.lock();
    expect(vault.getKey("anthropic")).toBeNull();
    expect(vault.snapshot().status).toBe("locked");
    await vault.unlock(PASS);
    expect(vault.getKey("anthropic")).toBe(KEY);
  });

  it("survives a reload: a new vault over the same store unlocks with the passphrase", async () => {
    await unlockedWithKey();
    const fresh = makeVault();
    await fresh.load();
    expect(fresh.snapshot()).toMatchObject({
      status: "locked",
      keys: [{ provider: "anthropic", last4: "WXYZ" }],
    });
    await fresh.unlock(PASS);
    expect(fresh.getKey("anthropic")).toBe(KEY);
  });

  it("rejects a wrong passphrase and stays locked", async () => {
    const vault = await unlockedWithKey();
    vault.lock();
    await expect(vault.unlock("nope")).rejects.toMatchObject({ code: "wrong-passphrase" });
    expect(vault.snapshot().status).toBe("locked");
    expect(vault.getKey("anthropic")).toBeNull();
  });

  it("stores a versioned envelope with PBKDF2-600k by default and only the last four", async () => {
    const vault = makeVault({ iterations: 600_000 });
    await vault.load();
    await vault.initialize(PASS);
    await vault.setKey("anthropic", KEY);
    const [envelope] = store.all();
    expect(envelope).toMatchObject({
      v: 1,
      kdf: "PBKDF2-SHA256",
      iter: 600_000,
      aad: "anthropic|v1",
      last4: "WXYZ",
    });
    expect(Object.keys(envelope ?? {}).sort()).toEqual(
      ["aad", "createdAt", "ct", "iter", "iv", "kdf", "last4", "salt", "v"].sort(),
    );
  });

  it("persists nothing plaintext", async () => {
    await unlockedWithKey();
    const dump = JSON.stringify(store.all());
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(KEY.slice(0, -4));
    expect(dump).not.toContain(PASS);
  });

  it("uses a fresh IV for every encryption of the same key", async () => {
    const vault = await unlockedWithKey();
    const seen = new Set([store.all()[0]?.iv]);
    for (let i = 0; i < 5; i++) {
      await vault.setKey("anthropic", KEY);
      seen.add(store.all()[0]?.iv);
    }
    expect(seen.size).toBe(6);
  });

  it("fails when the ciphertext is tampered with", async () => {
    const vault = await unlockedWithKey();
    vault.lock();
    const [envelope] = store.all();
    if (!envelope) throw new Error("no envelope");
    const bytes = Uint8Array.from(atob(envelope.ct), (c) => c.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    await store.put("user-1:anthropic", { ...envelope, ct: btoa(String.fromCharCode(...bytes)) });
    await expect(vault.unlock(PASS)).rejects.toBeInstanceOf(VaultError);
  });

  it("fails when an envelope is moved to another provider (AAD binding)", async () => {
    const vault = await unlockedWithKey();
    vault.lock();
    const [envelope] = store.all();
    if (!envelope) throw new Error("no envelope");
    await store.delete("user-1:anthropic");
    await store.put("user-1:openai", { ...envelope, aad: "openai|v1" });
    await expect(vault.unlock(PASS)).rejects.toBeInstanceOf(VaultError);
  });

  it("fails when the stored aad is rewritten to match a different provider", async () => {
    const vault = await unlockedWithKey();
    vault.lock();
    const [envelope] = store.all();
    if (!envelope) throw new Error("no envelope");
    await store.put("user-1:anthropic", { ...envelope, aad: "openai|v1" });
    await expect(vault.unlock(PASS)).rejects.toBeInstanceOf(VaultError);
  });

  it("derives a non-extractable AES-GCM-256 key", async () => {
    const spy = vi.spyOn(crypto.subtle, "deriveKey");
    await unlockedWithKey();
    expect(spy).toHaveBeenCalledTimes(1);
    const [, , algorithm, extractable, usages] = spy.mock.calls[0] ?? [];
    expect(algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(extractable).toBe(false);
    expect(usages).toEqual(["encrypt", "decrypt"]);
  });

  it("forgets a key by deleting its envelope", async () => {
    const vault = await unlockedWithKey();
    await vault.setKey("openai", OTHER);
    await vault.forget("anthropic");
    expect(store.all()).toHaveLength(1);
    expect(vault.getKey("anthropic")).toBeNull();
    expect(vault.snapshot().keys.map((k) => k.provider)).toEqual(["openai"]);
  });

  it("reset deletes every envelope and returns to the empty state", async () => {
    const vault = await unlockedWithKey();
    await vault.setKey("openai", OTHER);
    await vault.reset();
    expect(store.all()).toEqual([]);
    expect(vault.snapshot()).toEqual({ status: "empty", keys: [] });
    expect(vault.getKey("anthropic")).toBeNull();
  });

  it("replaces a key and notifies subscribers", async () => {
    const vault = await unlockedWithKey();
    const listener = vi.fn();
    vault.subscribe(listener);
    await vault.setKey("anthropic", OTHER);
    expect(vault.getKey("anthropic")).toBe(OTHER);
    expect(listener).toHaveBeenCalled();
    expect(store.all()).toHaveLength(1);
  });

  it("refuses to add a key while locked", async () => {
    const vault = await unlockedWithKey();
    vault.lock();
    await expect(vault.setKey("openai", OTHER)).rejects.toMatchObject({ code: "locked" });
  });

  it("refuses to initialize over existing envelopes", async () => {
    await unlockedWithKey();
    const fresh = makeVault();
    await fresh.load();
    await expect(fresh.initialize("another")).rejects.toMatchObject({ code: "already-set-up" });
  });

  it("refuses to initialize when another tab saved keys after this one loaded", async () => {
    const first = makeVault();
    const second = makeVault();
    await first.load();
    await second.load();
    expect(second.snapshot().status).toBe("empty");

    await first.initialize(PASS);
    await first.setKey("anthropic", KEY);

    await expect(second.initialize("a different passphrase")).rejects.toBeInstanceOf(
      VaultAlreadyInitializedError,
    );
    expect(second.snapshot()).toMatchObject({ status: "locked" });
    expect(store.all()).toHaveLength(1);
    await second.unlock(PASS);
    expect(second.getKey("anthropic")).toBe(KEY);
  });

  it("keepAlive postpones the idle lock while unlocked and ignores a locked vault", async () => {
    const vault = makeVault({ idleMs: 1000 });
    await unlockedWithKey(vault);
    vi.advanceTimersByTime(900);
    vault.keepAlive();
    vi.advanceTimersByTime(900);
    expect(vault.snapshot().status).toBe("unlocked");
    vi.advanceTimersByTime(200);
    expect(vault.snapshot().status).toBe("locked");
    vault.keepAlive();
    vi.advanceTimersByTime(5000);
    expect(vault.snapshot().status).toBe("locked");
  });

  it("keeps envelopes of different users apart", async () => {
    await unlockedWithKey();
    const other = new Vault({
      store,
      scope: "user-2",
      iterations: ITER,
      idleMs: 1000,
      now: () => now,
    });
    await other.load();
    expect(other.snapshot()).toMatchObject({ status: "empty", keys: [] });
  });
});

describe("vault locking", () => {
  it("locks after the idle timeout", async () => {
    const vault = await unlockedWithKey(makeVault({ idleMs: 60_000 }));
    vi.advanceTimersByTime(59_000);
    expect(vault.snapshot().status).toBe("unlocked");
    vi.advanceTimersByTime(2_000);
    expect(vault.snapshot().status).toBe("locked");
    expect(vault.getKey("anthropic")).toBeNull();
  });

  it("using a key counts as activity and postpones the lock", async () => {
    const vault = await unlockedWithKey(makeVault({ idleMs: 60_000 }));
    vi.advanceTimersByTime(40_000);
    vault.getKey("anthropic");
    vi.advanceTimersByTime(40_000);
    expect(vault.snapshot().status).toBe("unlocked");
    vi.advanceTimersByTime(30_000);
    expect(vault.snapshot().status).toBe("locked");
  });

  it("locks when the page is hidden for good and on sign-out", async () => {
    const vault = await unlockedWithKey();
    const target = new EventTarget();
    vault.lockOn(target, ["pagehide", "et:sign-out"]);
    target.dispatchEvent(new Event("et:sign-out"));
    expect(vault.snapshot().status).toBe("locked");
    await vault.unlock(PASS);
    target.dispatchEvent(new Event("pagehide"));
    expect(vault.snapshot().status).toBe("locked");
  });

  it("defaults to a 30 minute idle timeout", async () => {
    const vault = new Vault({ store, scope: "u", iterations: ITER });
    expect(vault.idleMs).toBe(30 * 60_000);
  });
});
