import { type ProjectSettings, ProjectSettingsSchema } from "@et/contracts";
import type { ProjectSettingsRepository } from "@et/core";
import { json } from "./convert.ts";
import type { Sql } from "./sql.ts";
import { withOwner } from "./with-owner.ts";

export class PostgresProjectSettingsRepository implements ProjectSettingsRepository {
  constructor(
    private readonly sql: Sql,
    private readonly ownerId: string,
  ) {}

  async get(projectId: string): Promise<ProjectSettings | null> {
    const rows = await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query<{ json: unknown }>(
        "SELECT json FROM project_settings WHERE owner_id = $1 AND project_id = $2",
        [this.ownerId, projectId],
      ),
    );
    return rows[0] ? ProjectSettingsSchema.parse(json(rows[0].json)) : null;
  }

  async put(projectId: string, settings: ProjectSettings): Promise<void> {
    await withOwner(this.sql, this.ownerId, (tx) =>
      tx.query(
        `INSERT INTO project_settings (owner_id, project_id, json) VALUES ($1, $2, $3::text::jsonb)
         ON CONFLICT (owner_id, project_id) DO UPDATE SET json = excluded.json`,
        [this.ownerId, projectId, JSON.stringify(settings)],
      ),
    );
  }
}
