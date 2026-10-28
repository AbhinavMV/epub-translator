import type { Hasher } from "../../ports/system.ts";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const INVITE_TOKEN_BYTES = 32;

export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] ?? "";
    out += ALPHABET[(n >> 12) & 63] ?? "";
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63] ?? "";
    if (i + 2 < bytes.length) out += ALPHABET[n & 63] ?? "";
  }
  return out;
}

export function hashToken(hasher: Hasher, token: string): Promise<string> {
  return hasher.sha256(new TextEncoder().encode(token));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
