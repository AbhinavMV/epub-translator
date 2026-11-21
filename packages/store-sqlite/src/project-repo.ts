import type { Project, ProjectRepository } from "@et/core";
import type { Database } from "./db.ts";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  async create(project: Project): Promise<void> {
    this.db
      .prepare("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)")
      .run(project.id, project.name, project.createdAt);
  }

  async get(id: string): Promise<Project | null> {
    const row = this.db.prepare("SELECT id, name, created_at FROM projects WHERE id = ?").get(id) as
      | ProjectRow
      | undefined;
    return row ? toProject(row) : null;
  }

  async list(): Promise<Project[]> {
    const rows = this.db
      .prepare("SELECT id, name, created_at FROM projects ORDER BY created_at DESC, id")
      .all() as ProjectRow[];
    return rows.map(toProject);
  }

  async rename(id: string, name: string): Promise<void> {
    this.db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(name, id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  async seriesTitle(id: string): Promise<string | null> {
    const row = this.db.prepare("SELECT series_title FROM projects WHERE id = ?").get(id) as
      | { series_title: string | null }
      | undefined;
    return row?.series_title ?? null;
  }

  async adoptSeriesTitle(id: string, seriesTitle: string): Promise<void> {
    this.db
      .prepare("UPDATE projects SET series_title = ? WHERE id = ? AND series_title IS NULL")
      .run(seriesTitle, id);
  }

  async findBySeriesTitle(seriesTitle: string): Promise<Project | null> {
    const row = this.db
      .prepare(
        "SELECT id, name, created_at FROM projects WHERE series_title = ? ORDER BY created_at DESC, id LIMIT 1",
      )
      .get(seriesTitle) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }
}
