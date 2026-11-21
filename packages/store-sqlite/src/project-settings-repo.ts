import { type ProjectSettings, ProjectSettingsSchema } from "@et/contracts";
import type { ProjectSettingsRepository } from "@et/core";
import type { Database } from "./db.ts";

export class SqliteProjectSettingsRepository implements ProjectSettingsRepository {
  constructor(private readonly db: Database) {}

  async get(projectId: string): Promise<ProjectSettings | null> {
    const row = this.db
      .prepare("SELECT json FROM project_settings WHERE project_id = ?")
      .get(projectId) as { json: string } | undefined;
    return row ? ProjectSettingsSchema.parse(JSON.parse(row.json)) : null;
  }

  async put(projectId: string, settings: ProjectSettings): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO project_settings (project_id, json) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET json = excluded.json",
      )
      .run(projectId, JSON.stringify(settings));
  }
}
