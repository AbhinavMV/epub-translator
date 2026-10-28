import type {
  AppUser,
  AppUserRepository,
  AuthAdmin,
  AuthUser,
  Hasher,
  Invite,
  InviteRepository,
  NewInvite,
  RandomSource,
  RateLimiter,
} from "../../../src/index.ts";

export class MemoryInvites implements InviteRepository {
  readonly rows = new Map<string, Invite>();
  private seq = 0;
  constructor(private readonly clock: () => Date = () => new Date()) {}
  async create(invite: NewInvite) {
    const row: Invite = {
      ...invite,
      id: `inv-${++this.seq}`,
      createdAt: this.clock(),
      usedAt: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async list() {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
  async revoke(id: string) {
    this.rows.delete(id);
  }
  async consume(tokenHash: string, email: string, now: Date) {
    const row = [...this.rows.values()].find((r) => r.tokenHash === tokenHash);
    if (!row || row.usedAt || row.expiresAt <= now) return null;
    if (row.email !== null && row.email !== email) return null;
    row.usedAt = now;
    return { ...row };
  }
  async release(id: string) {
    const row = this.rows.get(id);
    if (row) row.usedAt = null;
  }
}

export class MemoryAppUsers implements AppUserRepository {
  readonly rows = new Map<string, AppUser>();
  failUpsert = false;
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async upsert(user: AppUser) {
    if (this.failUpsert) throw new Error("db down");
    this.rows.set(user.id, { ...user });
  }
  async setDisabled(id: string, disabled: boolean) {
    const row = this.rows.get(id);
    if (row) row.disabled = disabled;
  }
  async list() {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class FakeAuthAdmin implements AuthAdmin {
  readonly users = new Map<string, { email: string; password: string; banned: boolean }>();
  failCreate = false;
  private seq = 0;
  async createUser(email: string, password: string) {
    if (this.failCreate) throw new Error("email_exists");
    const id = `user-${++this.seq}`;
    this.users.set(id, { email, password, banned: false });
    return { id };
  }
  async deleteUser(id: string) {
    this.users.delete(id);
  }
  async banUser(id: string, banned: boolean) {
    const u = this.users.get(id);
    if (u) u.banned = banned;
  }
  async recoveryLink(email: string) {
    return `https://auth.test/recover?email=${email}`;
  }
  async listUsers(): Promise<AuthUser[]> {
    return [...this.users.entries()].map(([id, u]) => ({ id, email: u.email }));
  }
}

export class CountingRandom implements RandomSource {
  private n = 0;
  bytes(length: number) {
    this.n += 1;
    return Uint8Array.from({ length }, (_, i) => (i * 7 + this.n * 13) % 256);
  }
}

export const fakeHasher: Hasher = {
  sha256: async (bytes) => `sha:${Array.from(bytes).join(",")}`,
};

export class LimitedAfter implements RateLimiter {
  calls: string[] = [];
  constructor(private readonly allowed: number) {}
  async allow(key: string) {
    this.calls.push(key);
    return this.calls.length <= this.allowed;
  }
}

export const allowAll: RateLimiter = { allow: async () => true };
