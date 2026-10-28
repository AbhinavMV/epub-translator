import type { AppUser, AppUserRepository, Invite, InviteRepository, NewInvite } from "@et/core";
import type { PostgresAppUserRepository, PostgresInviteRepository } from "@et/store-postgres";

type PgInvite = Awaited<ReturnType<PostgresInviteRepository["create"]>>;

function toInvite(row: PgInvite): Invite {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    email: row.email,
    createdBy: row.createdBy ?? "",
    createdAt: new Date(row.createdAt),
    expiresAt: new Date(row.expiresAt),
    usedAt: row.usedAt ? new Date(row.usedAt) : null,
  };
}

export class PostgresInviteAdapter implements InviteRepository {
  constructor(private readonly repo: PostgresInviteRepository) {}

  async create(invite: NewInvite): Promise<Invite> {
    return toInvite(
      await this.repo.create({ ...invite, expiresAt: invite.expiresAt.toISOString() }),
    );
  }

  async list(): Promise<Invite[]> {
    return (await this.repo.list()).map(toInvite);
  }

  async revoke(id: string): Promise<void> {
    await this.repo.revoke(id);
  }

  async consume(tokenHash: string, email: string, now: Date): Promise<Invite | null> {
    const row = await this.repo.accept(tokenHash, email, now);
    return row ? toInvite(row) : null;
  }

  release(id: string): Promise<void> {
    return this.repo.rollbackAccept(id);
  }

  markUsedBy(id: string, userId: string): Promise<void> {
    return this.repo.markUsedBy(id, userId);
  }
}

export class PostgresAppUserAdapter implements AppUserRepository {
  constructor(private readonly repo: PostgresAppUserRepository) {}

  async get(id: string): Promise<AppUser | null> {
    const row = await this.repo.get(id);
    return row ? { id: row.id, role: row.role, disabled: row.disabled } : null;
  }

  async upsert(user: AppUser): Promise<void> {
    await this.repo.upsert(user);
  }

  setDisabled(id: string, disabled: boolean): Promise<void> {
    return this.repo.setDisabled(id, disabled);
  }

  async list(): Promise<AppUser[]> {
    return (await this.repo.list()).map((r) => ({
      id: r.id,
      role: r.role,
      disabled: r.disabled,
    }));
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
