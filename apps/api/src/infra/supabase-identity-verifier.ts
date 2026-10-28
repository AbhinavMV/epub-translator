import type { IdentityVerifier, VerifiedIdentity } from "@et/core";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

// Asymmetric only: an HS256 token must never be checked against a public key set.
const ALGORITHMS = ["ES256", "RS256", "EdDSA"];

export interface SupabaseVerifierOptions {
  issuer: string;
  keys: JWTVerifyGetKey;
}

export class SupabaseIdentityVerifier implements IdentityVerifier {
  constructor(private readonly options: SupabaseVerifierOptions) {}

  async verify(token: string): Promise<VerifiedIdentity | null> {
    try {
      const { payload } = await jwtVerify(token, this.options.keys, {
        issuer: this.options.issuer,
        audience: "authenticated",
        algorithms: ALGORITHMS,
      });
      const { sub, email } = payload;
      if (typeof sub !== "string" || typeof email !== "string" || !sub || !email) return null;
      return { userId: sub, email };
    } catch {
      return null;
    }
  }
}

export function createSupabaseIdentityVerifier(supabaseUrl: string): SupabaseIdentityVerifier {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  return new SupabaseIdentityVerifier({
    issuer: base,
    keys: createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)),
  });
}
