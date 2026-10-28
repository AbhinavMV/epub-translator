import {
  aadFor,
  type Envelope,
  type EnvelopeStore,
  fromBase64,
  type KeyedProvider,
  type KeyInfo,
  toBase64,
} from "./envelope";

export const DEFAULT_ITERATIONS = 600_000;
export const DEFAULT_IDLE_MS = 30 * 60_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type VaultErrorCode =
  | "locked"
  | "wrong-passphrase"
  | "already-set-up"
  | "not-set-up"
  | "empty-key";

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export class VaultAlreadyInitializedError extends VaultError {
  constructor() {
    super("already-set-up", "A passphrase is already set");
    this.name = "VaultAlreadyInitializedError";
  }
}

export type VaultStatus = "empty" | "locked" | "unlocked";

export interface VaultSnapshot {
  status: VaultStatus;
  keys: KeyInfo[];
}

export interface VaultOptions {
  store: EnvelopeStore;
  scope: string;
  iterations?: number;
  idleMs?: number;
  now?: () => number;
}

interface Unlocked {
  cryptoKey: CryptoKey;
  salt: string;
  iter: number;
  keys: Map<KeyedProvider, string>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export class Vault {
  readonly idleMs: number;
  private readonly store: EnvelopeStore;
  private readonly scope: string;
  private readonly iterations: number;
  private readonly now: () => number;
  private infos: KeyInfo[] = [];
  private unlocked: Unlocked | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private current: VaultSnapshot = { status: "empty", keys: [] };
  private readonly listeners = new Set<() => void>();

  constructor(options: VaultOptions) {
    this.store = options.store;
    this.scope = options.scope;
    this.iterations = options.iterations ?? DEFAULT_ITERATIONS;
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.now = options.now ?? Date.now;
  }

  snapshot(): VaultSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<number> {
    const stored = await this.store.list(this.prefix());
    this.infos = stored.flatMap(({ id, envelope }) => {
      const provider = id.slice(this.prefix().length) as KeyedProvider;
      return [{ provider, last4: envelope.last4, createdAt: envelope.createdAt }];
    });
    this.publish();
    return stored.length;
  }

  async initialize(passphrase: string): Promise<void> {
    if (this.unlocked) throw new VaultAlreadyInitializedError();
    if ((await this.load()) > 0) throw new VaultAlreadyInitializedError();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    this.unlocked = {
      cryptoKey: await derive(passphrase, salt, this.iterations),
      salt: toBase64(salt),
      iter: this.iterations,
      keys: new Map(),
    };
    this.touch();
    this.publish();
  }

  async unlock(passphrase: string): Promise<void> {
    const stored = await this.store.list(this.prefix());
    const first = stored[0]?.envelope;
    if (!first) throw new VaultError("not-set-up", "No keys are stored on this device");

    const derived = new Map<string, CryptoKey>();
    const keys = new Map<KeyedProvider, string>();
    for (const { id, envelope } of stored) {
      const provider = id.slice(this.prefix().length) as KeyedProvider;
      const tag = `${envelope.salt}:${envelope.iter}`;
      let cryptoKey = derived.get(tag);
      if (!cryptoKey) {
        cryptoKey = await derive(passphrase, fromBase64(envelope.salt), envelope.iter);
        derived.set(tag, cryptoKey);
      }
      keys.set(provider, await this.open(cryptoKey, provider, envelope));
    }
    const head = derived.get(`${first.salt}:${first.iter}`);
    if (!head) throw new VaultError("wrong-passphrase", "Wrong passphrase");
    this.unlocked = { cryptoKey: head, salt: first.salt, iter: first.iter, keys };
    this.touch();
    this.publish();
  }

  async setKey(provider: KeyedProvider, apiKey: string): Promise<void> {
    const state = this.unlocked;
    if (!state) throw new VaultError("locked", "Unlock your keys first");
    const secret = apiKey.trim();
    if (!secret) throw new VaultError("empty-key", "The key is empty");

    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const aad = aadFor(provider);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
      state.cryptoKey,
      encoder.encode(secret),
    );
    const envelope: Envelope = {
      v: 1,
      kdf: "PBKDF2-SHA256",
      iter: state.iter,
      salt: state.salt,
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(ct)),
      aad,
      last4: secret.slice(-4),
      createdAt: new Date(this.now()).toISOString(),
    };
    await this.store.put(this.idOf(provider), envelope);
    state.keys.set(provider, secret);
    this.infos = [
      ...this.infos.filter((i) => i.provider !== provider),
      { provider, last4: envelope.last4, createdAt: envelope.createdAt },
    ];
    this.touch();
    this.publish();
  }

  async forget(provider: KeyedProvider): Promise<void> {
    await this.store.delete(this.idOf(provider));
    this.unlocked?.keys.delete(provider);
    this.infos = this.infos.filter((i) => i.provider !== provider);
    this.publish();
  }

  async reset(): Promise<void> {
    for (const { provider } of this.infos) await this.store.delete(this.idOf(provider));
    this.infos = [];
    this.lock();
    this.publish();
  }

  getKey(provider: KeyedProvider): string | null {
    if (!this.unlocked) return null;
    this.touch();
    return this.unlocked.keys.get(provider) ?? null;
  }

  keepAlive(): void {
    if (this.unlocked) this.touch();
  }

  lock(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.unlocked) return;
    this.unlocked = null;
    this.publish();
  }

  lockOn(target: EventTarget, events: readonly string[]): () => void {
    const handler = () => this.lock();
    for (const name of events) target.addEventListener(name, handler);
    return () => {
      for (const name of events) target.removeEventListener(name, handler);
    };
  }

  private async open(
    cryptoKey: CryptoKey,
    provider: KeyedProvider,
    envelope: Envelope,
  ): Promise<string> {
    const expected = aadFor(provider);
    if (envelope.aad !== expected) {
      throw new VaultError("wrong-passphrase", "Stored key is damaged");
    }
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: encoder.encode(expected) },
        cryptoKey,
        fromBase64(envelope.ct),
      );
      return decoder.decode(plain);
    } catch {
      throw new VaultError("wrong-passphrase", "Wrong passphrase, or the stored key is damaged");
    }
  }

  private touch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.lock(), this.idleMs);
  }

  private prefix(): string {
    return `${this.scope}:`;
  }

  private idOf(provider: KeyedProvider): string {
    return `${this.prefix()}${provider}`;
  }

  private publish(): void {
    const status: VaultStatus = this.unlocked
      ? "unlocked"
      : this.infos.length > 0
        ? "locked"
        : "empty";
    this.current = { status, keys: [...this.infos] };
    for (const listener of this.listeners) listener();
  }
}
