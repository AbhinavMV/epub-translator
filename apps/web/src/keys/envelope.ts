import type { ProviderId } from "@et/contracts";

export type KeyedProvider = Exclude<ProviderId, "fake">;

export const KEYED_PROVIDERS: readonly KeyedProvider[] = ["anthropic", "openai", "gemini"];

export interface Envelope {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
  aad: string;
  last4: string;
  createdAt: string;
}

export interface EnvelopeStore {
  get(id: string): Promise<Envelope | undefined>;
  put(id: string, envelope: Envelope): Promise<void>;
  delete(id: string): Promise<void>;
  list(prefix: string): Promise<{ id: string; envelope: Envelope }[]>;
}

export interface KeyInfo {
  provider: KeyedProvider;
  last4: string;
  createdAt: string;
}

export const aadFor = (provider: KeyedProvider) => `${provider}|v1`;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    e.v === 1 &&
    e.kdf === "PBKDF2-SHA256" &&
    typeof e.iter === "number" &&
    typeof e.salt === "string" &&
    typeof e.iv === "string" &&
    typeof e.ct === "string" &&
    typeof e.aad === "string" &&
    typeof e.last4 === "string" &&
    typeof e.createdAt === "string"
  );
}
