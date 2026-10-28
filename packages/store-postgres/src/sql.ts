export type Row = Record<string, unknown>;

export interface Queryable {
  query<T extends object = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
}

export interface Sql extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}
