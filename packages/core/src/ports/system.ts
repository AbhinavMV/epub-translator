export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface Hasher {
  sha256(bytes: Uint8Array): Promise<string>;
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;
