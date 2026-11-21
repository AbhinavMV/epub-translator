import { type ProjectSettings, ProjectSettingsSchema } from "@et/contracts";
import type { Project, ProjectRepository } from "@et/core";
import { iso, json } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

interface ProjectRow {
  id: string;
  name: string;
  created_at: Date | string;
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  createdAt: iso(row.created_at),
});

export class PostgresProjectRepository implements ProjectRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async create(project: Project): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        "INSERT INTO projects (owner_id, id, name, created_at) VALUES ($1, $2, $3, $4::timestamptz)",
        [this.ownerId, project.id, project.name, project.createdAt],
      ),
    );
  }

  async get(id: string): Promise<Project | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<ProjectRow>(
        "SELECT id, name, created_at FROM projects WHERE owner_id = $1 AND id = $2",
        [this.ownerId, id],
      ),
    );
    return rows[0] ? toProject(rows[0]) : null;
  }

  async list(): Promise<Project[]> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<ProjectRow>(
        "SELECT id, name, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC, id",
        [this.ownerId],
      ),
    );
    return rows.map(toProject);
  }

  async rename(id: string, name: string): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("UPDATE projects SET name = $3 WHERE owner_id = $1 AND id = $2", [
        this.ownerId,
        id,
        name,
      ]),
    );
  }

  async delete(id: string): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query("DELETE FROM projects WHERE owner_id = $1 AND id = $2", [this.ownerId, id]),
    );
  }

  async getSettings(id: string): Promise<ProjectSettings | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<{ json: unknown }>(
        "SELECT json FROM project_settings WHERE owner_id = $1 AND project_id = $2",
        [this.ownerId, id],
      ),
    );
    return rows[0] ? ProjectSettingsSchema.parse(json(rows[0].json)) : null;
  }

  async putSettings(id: string, settings: ProjectSettings): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO project_settings (owner_id, project_id, json) VALUES ($1, $2, $3::text::jsonb)
         ON CONFLICT (owner_id, project_id) DO UPDATE SET json = excluded.json`,
        [this.ownerId, id, JSON.stringify(settings)],
      ),
    );
  }
}
