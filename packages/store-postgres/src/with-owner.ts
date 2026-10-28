import type { Queryable, Sql } from "./sql.ts";

export async function withOwner<T>(
  sql: Sql,
  ownerId: string,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: ownerId, role: "authenticated" });
  return sql.transaction(async (tx) => {
    await tx.exec("set local role et_owner");
    await tx.query(
      "select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [claims, ownerId],
    );
    return fn(tx);
  });
}
