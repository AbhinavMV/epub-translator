import { type Envelope, type EnvelopeStore, isEnvelope } from "./envelope";

const DB_NAME = "et-key-vault";
const STORE = "envelopes";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export class IndexedDbEnvelopeStore implements EnvelopeStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = this.factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Cannot open IndexedDB"));
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE);
  }

  async get(id: string) {
    const value: unknown = await request((await this.store("readonly")).get(id));
    return isEnvelope(value) ? value : undefined;
  }

  async put(id: string, envelope: Envelope) {
    await request((await this.store("readwrite")).put(envelope, id));
  }

  async delete(id: string) {
    await request((await this.store("readwrite")).delete(id));
  }

  async list(prefix: string) {
    const store = await this.store("readonly");
    const ids = (await request(store.getAllKeys())).map(String).filter((k) => k.startsWith(prefix));
    const out: { id: string; envelope: Envelope }[] = [];
    for (const id of ids) {
      const envelope = await this.get(id);
      if (envelope) out.push({ id, envelope });
    }
    return out;
  }
}
