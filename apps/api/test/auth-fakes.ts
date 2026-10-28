import type {
  AppUser,
  AppUserRepository,
  AuthAdmin,
  ChapterRenderer,
  EpubAssets,
  EpubExporter,
  EpubParser,
  IdentityVerifier,
  Invite,
  InviteRepository,
  NewInvite,
  ParsedBook,
  Repositories,
  VerifiedIdentity,
} from "@et/core";
import { FakeProvider } from "@et/providers";
import { createLocalServices } from "../src/compose-local.ts";
import type { AuthDeps } from "../src/http/auth.ts";

export class FakeVerifier implements IdentityVerifier {
  readonly tokens = new Map<string, VerifiedIdentity>();
  async verify(token: string) {
    return this.tokens.get(token) ?? null;
  }
}

export class MemoryUsers implements AppUserRepository {
  readonly rows = new Map<string, AppUser>();
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async upsert(user: AppUser) {
    this.rows.set(user.id, { ...user });
  }
  async setDisabled(id: string, disabled: boolean) {
    const r = this.rows.get(id);
    if (r) r.disabled = disabled;
  }
  async list() {
    return [...this.rows.values()];
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class MemoryInviteRepo implements InviteRepository {
  readonly rows = new Map<string, Invite>();
  private seq = 0;
  async create(invite: NewInvite) {
    const row: Invite = {
      ...invite,
      id: `cccccccc-cccc-4ccc-8ccc-${String(++this.seq).padStart(12, "0")}`,
      createdAt: new Date(),
      usedAt: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async list() {
    return [...this.rows.values()];
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

export class FakeAdmin implements AuthAdmin {
  readonly accounts = new Map<string, { email: string; banned: boolean }>();
  failCreate = false;
  private seq = 0;
  async createUser(email: string) {
    if (this.failCreate) throw new Error("exists");
    const id = `acct-${++this.seq}`;
    this.accounts.set(id, { email, banned: false });
    return { id };
  }
  async deleteUser(id: string) {
    this.accounts.delete(id);
  }
  async banUser(id: string, banned: boolean) {
    const a = this.accounts.get(id);
    if (a) a.banned = banned;
  }
  async recoveryLink(email: string) {
    return `https://auth.test/verify?recover=${encodeURIComponent(email)}`;
  }
  async listUsers() {
    return [...this.accounts].map(([id, a]) => ({ id, email: a.email }));
  }
}

const parsed: ParsedBook = {
  title: "本",
  author: null,
  sourceLang: "ja",
  coverHref: "cover.png",
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一二" }],
};
const parser: EpubParser = { parse: async () => parsed };
const assets: EpubAssets = {
  read: async () => ({ mediaType: "image/png", bytes: new Uint8Array([1, 2, 3]) }),
};
const renderer: ChapterRenderer = {
  render: async (_b, _book, chapterId) => ({
    chapterId,
    index: 0,
    title: "",
    prevChapterId: null,
    nextChapterId: null,
    blocks: [],
  }),
};
const exporter: EpubExporter = { export: async () => new Uint8Array([1]) };

export function localServices() {
  return createLocalServices({
    dataDir: ":memory:",
    env: {},
    epub: { parser, assets, renderer, exporter },
    fakeProvider: new FakeProvider(),
  });
}

export function multiOwnerServices() {
  const base = localServices();
  const perOwner = new Map<string, Repositories>();
  return {
    ...base,
    factory: {
      forOwner: (ownerId: string) => {
        let repos = perOwner.get(ownerId);
        if (!repos) {
          repos = localServices().repos;
          perOwner.set(ownerId, repos);
        }
        return repos;
      },
    },
  };
}

export const ADMIN_EMAIL = "admin@example.com";

export function authHarness(now = new Date("2026-10-28T00:00:00Z")) {
  const verifier = new FakeVerifier();
  const users = new MemoryUsers();
  const invites = new MemoryInviteRepo();
  const admin = new FakeAdmin();
  let calls = 0;
  const auth: AuthDeps = {
    verifier,
    users,
    invites,
    admin,
    random: { bytes: (n) => Uint8Array.from({ length: n }, (_, i) => (i + ++calls) % 256) },
    hasher: {
      sha256: async (bytes) => {
        const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
        return Buffer.from(digest).toString("hex");
      },
    },
    clock: { now: () => now },
    rateLimiter: { allow: async () => true },
    adminEmails: new Set([ADMIN_EMAIL]),
    publicConfig: {
      supabaseUrl: "https://x.supabase.co",
      supabasePublishableKey: "sb_publishable_x",
    },
  };
  verifier.tokens.set("admin-token", {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: ADMIN_EMAIL,
  });
  verifier.tokens.set("user-token", {
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "reader@example.com",
  });
  users.rows.set("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    role: "admin",
    disabled: false,
  });
  users.rows.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    role: "user",
    disabled: false,
  });
  admin.accounts.set("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { email: ADMIN_EMAIL, banned: false });
  admin.accounts.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
    email: "reader@example.com",
    banned: false,
  });
  return { auth, verifier, users, invites, admin };
}
