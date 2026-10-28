export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function json<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
