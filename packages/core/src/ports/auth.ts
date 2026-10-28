import type { AppRole } from "@et/contracts";

export interface VerifiedIdentity {
  userId: string;
  email: string;
}

export interface IdentityVerifier {
  verify(token: string): Promise<VerifiedIdentity | null>;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthAdmin {
  createUser(email: string, password: string): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
  banUser(id: string, banned: boolean): Promise<void>;
  recoveryLink(email: string): Promise<string>;
  listUsers(): Promise<AuthUser[]>;
}

export interface AppUser {
  id: string;
  role: AppRole;
  disabled: boolean;
}

export interface AppUserRepository {
  get(id: string): Promise<AppUser | null>;
  upsert(user: AppUser): Promise<void>;
  setDisabled(id: string, disabled: boolean): Promise<void>;
  list(): Promise<AppUser[]>;
  delete(id: string): Promise<void>;
}

export interface Invite {
  id: string;
  tokenHash: string;
  email: string | null;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface NewInvite {
  tokenHash: string;
  email: string | null;
  createdBy: string;
  expiresAt: Date;
}

export interface InviteRepository {
  create(invite: NewInvite): Promise<Invite>;
  list(): Promise<Invite[]>;
  revoke(id: string): Promise<void>;
  consume(tokenHash: string, email: string, now: Date): Promise<Invite | null>;
  release(id: string): Promise<void>;
}

export interface RandomSource {
  bytes(length: number): Uint8Array;
}

export interface RateLimiter {
  allow(key: string): Promise<boolean>;
}
