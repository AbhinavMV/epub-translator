import { iso } from "./convert.ts";
import type { Sql } from "./sql.ts";

export interface Invite {
  id: string;
  tokenHash: string;
  email: string | null;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
}

export interface NewInvite {
  tokenHash: string;
  email: string | null;
  createdBy: string | null;
  expiresAt: string;
}

interface InviteRow {
  id: string;
  token_hash: string;
  email: string | null;
  created_by: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  used_at: Date | string | null;
  used_by: string | null;
}

const COLUMNS = "id, token_hash, email, created_by, created_at, expires_at, used_at, used_by";

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    email: row.email,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    usedAt: row.used_at ? iso(row.used_at) : null,
    usedBy: row.used_by,
  };
}

/** Server-only: runs as the connecting role, never under an owner's RLS role. */
export class PostgresInviteRepository {
  constructor(private readonly sql: Sql) {}

  async create(invite: NewInvite): Promise<Invite> {
    const rows = await this.sql.transaction((tx) =>
      tx.query<InviteRow>(
        `INSERT INTO invites (token_hash, email, created_by, expires_at)
         VALUES ($1, $2, $3, $4::timestamptz) RETURNING ${COLUMNS}`,
        [invite.tokenHash, invite.email?.toLowerCase() ?? null, invite.createdBy, invite.expiresAt],
      ),
    );
    return toInvite(rows[0] as InviteRow);
  }

  async list(): Promise<Invite[]> {
    const rows = await this.sql.query<InviteRow>(
      `SELECT ${COLUMNS} FROM invites ORDER BY created_at DESC`,
    );
    return rows.map(toInvite);
  }

  async revoke(id: string): Promise<boolean> {
    const rows = await this.sql.query(
      "DELETE FROM invites WHERE id = $1 AND used_at IS NULL RETURNING id",
      [id],
    );
    return rows.length > 0;
  }

  async accept(tokenHash: string, email: string, now: Date): Promise<Invite | null> {
    const rows = await this.sql.query<InviteRow>(
      `UPDATE invites SET used_at = $3::timestamptz
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $3::timestamptz
         AND (email IS NULL OR email = $2)
       RETURNING ${COLUMNS}`,
      [tokenHash, email.toLowerCase(), now.toISOString()],
    );
    return rows[0] ? toInvite(rows[0]) : null;
  }

  async markUsedBy(id: string, userId: string): Promise<void> {
    await this.sql.query("UPDATE invites SET used_by = $2 WHERE id = $1", [id, userId]);
  }

  async rollbackAccept(id: string): Promise<void> {
    await this.sql.query("UPDATE invites SET used_at = NULL, used_by = NULL WHERE id = $1", [id]);
  }
}
