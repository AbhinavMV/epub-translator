import type { Envelope, EnvelopeStore } from "./envelope";

export class MemoryEnvelopeStore implements EnvelopeStore {
  private readonly rows = new Map<string, Envelope>();

  async get(id: string) {
    return this.rows.get(id);
  }

  async put(id: string, envelope: Envelope) {
    this.rows.set(id, structuredClone(envelope));
  }

  async delete(id: string) {
    this.rows.delete(id);
  }

  async list(prefix: string) {
    return [...this.rows]
      .filter(([id]) => id.startsWith(prefix))
      .map(([id, envelope]) => ({ id, envelope: structuredClone(envelope) }));
  }

  all(): Envelope[] {
    return [...this.rows.values()];
  }
}
