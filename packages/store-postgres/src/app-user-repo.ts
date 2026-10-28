import { iso } from "./convert.ts";
import type { Sql } from "./sql.ts";

export type AppUserRole = "admin" | "user";

export interface AppUser {
  id: string;
  role: AppUserRole;
  disabled: boolean;
  createdAt: string;
}

interface AppUserRow {
  id: string;
  role: AppUserRole;
  disabled: boolean;
  created_at: Date | string;
}

const COLUMNS = "id, role, disabled, created_at";

function toAppUser(row: AppUserRow): AppUser {
  return { id: row.id, role: row.role, disabled: row.disabled, createdAt: iso(row.created_at) };
}

/** Server-only: runs as the connecting role, never under an owner's RLS role. */
export class PostgresAppUserRepository {
  constructor(private readonly sql: Sql) {}

  async get(id: string): Promise<AppUser | null> {
    const rows = await this.sql.query<AppUserRow>(
      `SELECT ${COLUMNS} FROM app_users WHERE id = $1`,
      [id],
    );
    return rows[0] ? toAppUser(rows[0]) : null;
  }

  async list(): Promise<AppUser[]> {
    const rows = await this.sql.query<AppUserRow>(
      `SELECT ${COLUMNS} FROM app_users ORDER BY created_at`,
    );
    return rows.map(toAppUser);
  }

  async upsert(user: { id: string; role: AppUserRole; disabled?: boolean }): Promise<AppUser> {
    const rows = await this.sql.query<AppUserRow>(
      `INSERT INTO app_users (id, role, disabled) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET role = excluded.role, disabled = excluded.disabled
       RETURNING ${COLUMNS}`,
      [user.id, user.role, user.disabled ?? false],
    );
    return toAppUser(rows[0] as AppUserRow);
  }

  async setDisabled(id: string, disabled: boolean): Promise<void> {
    await this.sql.query("UPDATE app_users SET disabled = $2 WHERE id = $1", [id, disabled]);
  }

  async setRole(id: string, role: AppUserRole): Promise<void> {
    await this.sql.query("UPDATE app_users SET role = $2 WHERE id = $1", [id, role]);
  }
}
