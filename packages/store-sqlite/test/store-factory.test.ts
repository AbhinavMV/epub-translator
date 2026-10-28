import { LOCAL_OWNER_ID } from "@et/contracts";
import { describe, expect, it } from "vitest";
import { openDatabase, SqliteStoreFactory, UnsupportedOwnerError } from "../src/index.ts";

describe("SqliteStoreFactory", () => {
  it("serves the same repositories for the local owner on every call", async () => {
    const factory = new SqliteStoreFactory(openDatabase(":memory:"));
    const repos = factory.forOwner(LOCAL_OWNER_ID);
    expect(factory.forOwner(LOCAL_OWNER_ID)).toBe(repos);
    expect(await repos.books.list()).toEqual([]);
  });

  it("refuses any other owner instead of sharing the local library", () => {
    const factory = new SqliteStoreFactory(openDatabase(":memory:"));
    expect(() => factory.forOwner("11111111-1111-1111-1111-111111111111")).toThrow(
      UnsupportedOwnerError,
    );
  });
});
