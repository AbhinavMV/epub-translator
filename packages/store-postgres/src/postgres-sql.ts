import postgres from "postgres";
import type { Queryable, Sql } from "./sql.ts";

export interface PostgresSqlOptions {
  ssl?: "require" | "prefer" | false;
  max?: number;
}

type Runner = Pick<postgres.Sql, "unsafe">;

function queryable(runner: Runner): Queryable {
  return {
    async query<T extends object>(text: string, params: readonly unknown[] = []) {
      const rows = await runner.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return [...rows] as unknown as T[];
    },
    async exec(text: string) {
      await runner.unsafe(text);
    },
  };
}

export function createPostgresSql(url: string, options: PostgresSqlOptions = {}): Sql {
  const client = postgres(url, {
    prepare: false,
    max: options.max ?? 1,
    ssl: options.ssl ?? "require",
  });
  return {
    ...queryable(client),
    transaction: (fn) => client.begin((tx) => fn(queryable(tx))) as ReturnType<typeof fn>,
    end: () => client.end(),
  };
}
