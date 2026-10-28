import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { concatMigrations, loadMigrations, MIGRATIONS_DIR } from "../src/migrations.ts";

writeFileSync(join(MIGRATIONS_DIR, "all.sql"), concatMigrations(loadMigrations()));
