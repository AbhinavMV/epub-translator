export class BytesLru {
  private readonly entries = new Map<string, Uint8Array>();
  private size = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): Uint8Array | undefined {
    const bytes = this.entries.get(key);
    if (!bytes) return undefined;
    this.entries.delete(key);
    this.entries.set(key, bytes);
    return bytes;
  }

  set(key: string, bytes: Uint8Array): void {
    this.delete(key);
    if (bytes.byteLength > this.maxBytes) return;
    this.entries.set(key, bytes);
    this.size += bytes.byteLength;
    for (const [oldest, value] of this.entries) {
      if (this.size <= this.maxBytes) break;
      this.entries.delete(oldest);
      this.size -= value.byteLength;
    }
  }

  delete(key: string): void {
    const bytes = this.entries.get(key);
    if (!bytes) return;
    this.entries.delete(key);
    this.size -= bytes.byteLength;
  }
}
