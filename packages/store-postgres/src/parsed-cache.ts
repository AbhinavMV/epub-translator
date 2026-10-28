import type { ParsedBook } from "@et/core";

export class ParsedBookCache {
  private readonly entries = new Map<string, ParsedBook>();

  constructor(private readonly capacity = 16) {}

  get(ownerId: string, bookId: string): ParsedBook | undefined {
    const key = `${ownerId}/${bookId}`;
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(ownerId: string, bookId: string, parsed: ParsedBook): void {
    const key = `${ownerId}/${bookId}`;
    this.entries.delete(key);
    this.entries.set(key, parsed);
    const oldest = this.entries.keys().next().value;
    if (this.entries.size > this.capacity && oldest !== undefined) this.entries.delete(oldest);
  }

  delete(ownerId: string, bookId: string): void {
    this.entries.delete(`${ownerId}/${bookId}`);
  }
}
