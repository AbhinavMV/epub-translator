import { applyMigrations, createPostgresSql, loadMigrations } from "../src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = createPostgresSql(url);
try {
  const applied = await applyMigrations(sql, loadMigrations());
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
} finally {
  await sql.end();
}
