import { createHash } from "node:crypto";
import { BookSummarySchema } from "@et/contracts";
import { ALICE, BOB, createTestDatabase } from "@et/store-postgres/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { composeHosted } from "../src/compose-hosted.ts";
import { EXPORT_MAX_AGE_MS } from "../src/infra/supabase-exports.ts";
import {
  assets,
  BIG_EXPORT,
  exporter,
  FakeStorage,
  FakeVerifier,
  HOSTED_ENV,
  parser,
  renderer,
} from "./hosted-fakes.ts";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>["db"];

const HOST = "https://app.example.com";
const EPUB = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);

let db: TestDb;
let storage: FakeStorage;
let app: ReturnType<typeof createApp>;

function build(env: Record<string, string | undefined> = HOSTED_ENV) {
  const sql = pgSql();
  const { services, options } = composeHosted(env, {
    sql,
    storage,
    epub: { parser, assets, renderer, exporter },
  });
  const verifier = new FakeVerifier();
  verifier.tokens.set("alice", { userId: ALICE, email: "admin@example.com" });
  verifier.tokens.set("bob", { userId: BOB, email: "bob@example.com" });
  if (!options.auth) throw new Error("auth expected");
  return createApp(services, { ...options, auth: { ...options.auth, verifier } });
}

let pgSql: () => import("@et/store-postgres").Sql;

beforeAll(async () => {
  const created = await createTestDatabase();
  db = created.db;
  pgSql = () => created.sql;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("truncate public.books, public.app_users, public.invites, public.rate_limits cascade");
  await db.exec(
    `insert into public.app_users (id, role) values ('${BOB}', 'user') on conflict do nothing`,
  );
  storage = new FakeStorage();
  app = build();
});

const as = (token: string, init: RequestInit = {}) => ({
  ...init,
  headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
});
const post = (token: string, body: unknown) =>
  as(token, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

async function upload(token: string, owner: string, bytes = EPUB) {
  const res = await app.request(`${HOST}/api/uploads`, as(token, { method: "POST" }));
  const { path } = (await res.json()) as { path: string };
  expect(path.startsWith(`${owner}/incoming/`)).toBe(true);
  storage.seed("books", path, bytes);
  return path;
}

describe("composeHosted", () => {
  it("refuses to start outside AUTH_MODE=supabase", () => {
    expect(() => composeHosted({})).toThrow(/AUTH_MODE=supabase/);
    expect(() => composeHosted({ ...HOSTED_ENV, AUTH_MODE: "none" })).toThrow(/AUTH_MODE=supabase/);
  });

  it("refuses to start with missing configuration", () => {
    expect(() => composeHosted({ ...HOSTED_ENV, SUPABASE_SECRET_KEY: "" })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
    expect(() => composeHosted({ ...HOSTED_ENV, DATABASE_URL: "" })).toThrow();
  });
});

describe("hosted app surface", () => {
  it("rejects foreign hosts", async () => {
    const res = await app.request("https://evil.example.net/api/config");
    expect(res.status).toBe(403);
  });

  it("advertises signed uploads and the 50 MB cap", async () => {
    const config = await (await app.request(`${HOST}/api/config`)).json();
    expect(config).toMatchObject({
      authMode: "supabase",
      uploadMode: "signed",
      maxUploadBytes: 50 * 1024 * 1024,
    });
  });

  it("has no server-sent-events route", async () => {
    const res = await app.request(`${HOST}/api/jobs/anything/events`, as("alice"));
    expect(res.status).toBe(404);
  });

  it("never reports a provider as configured from the environment", async () => {
    const withKeys = build({
      ...HOSTED_ENV,
      ANTHROPIC_API_KEY: "sk-ant-leak",
      OPENAI_API_KEY: "sk-leak",
      GEMINI_API_KEY: "leak",
      ENABLE_FAKE_PROVIDER: "1",
    });
    const res = await withKeys.request(`${HOST}/api/providers`, as("alice"));
    const text = await res.text();
    const list = JSON.parse(text) as { id: string; configured: boolean; models: string[] }[];
    expect(list.map((p) => p.id).toSorted()).toEqual(["anthropic", "gemini", "openai"]);
    expect(list.every((p) => !p.configured)).toBe(true);
    expect(list.find((p) => p.id === "anthropic")?.models.length).toBeGreaterThan(0);
    expect(text).not.toContain("leak");
  });

  it("disables the multipart upload route", async () => {
    const form = new FormData();
    form.append("file", new File([EPUB], "b.epub"));
    const res = await app.request(`${HOST}/api/books`, as("alice", { method: "POST", body: form }));
    expect(res.status).toBe(404);
  });
});

describe("signed upload and import", () => {
  it("imports an uploaded object, moves it under the owner and removes the incoming copy", async () => {
    const path = await upload("alice", ALICE);
    const res = await app.request(`${HOST}/api/books/import`, post("alice", { path }));
    expect(res.status).toBe(201);
    const book = BookSummarySchema.parse(await res.json());
    const keys = [...storage.objects("books").keys()];
    expect(keys).toEqual([
      expect.stringMatching(new RegExp(`^${ALICE}/books/[0-9a-f]{64}\\.epub$`)),
    ]);
    expect(book.title).toBe("本");
    const list = (await (await app.request(`${HOST}/api/books`, as("alice"))).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("dedupes the same bytes per owner and drops the second incoming object", async () => {
    const first = await upload("alice", ALICE);
    const a = await (
      await app.request(`${HOST}/api/books/import`, post("alice", { path: first }))
    ).json();
    const second = await upload("alice", ALICE);
    const b = await (
      await app.request(`${HOST}/api/books/import`, post("alice", { path: second }))
    ).json();
    expect((b as { id: string }).id).toBe((a as { id: string }).id);
    expect([...storage.objects("books").keys()].filter((k) => k.includes("/incoming/"))).toEqual(
      [],
    );
    expect([...storage.objects("books").keys()]).toHaveLength(1);
  });

  it("re-imports when a stranded blob already sits at the destination", async () => {
    const sha = createHash("sha256").update(EPUB).digest("hex");
    storage.seed("books", `${ALICE}/books/${sha}.epub`, new Uint8Array([9, 9]));
    const path = await upload("alice", ALICE);
    const res = await app.request(`${HOST}/api/books/import`, post("alice", { path }));
    expect(res.status).toBe(201);
    expect([...storage.objects("books").keys()]).toEqual([`${ALICE}/books/${sha}.epub`]);
    expect(storage.objects("books").get(`${ALICE}/books/${sha}.epub`)?.bytes).toEqual(EPUB);
  });

  it("sweeps incoming uploads older than two hours on import", async () => {
    const old = `${ALICE}/incoming/22222222-2222-4222-8222-222222222222.epub`;
    const fresh = `${ALICE}/incoming/33333333-3333-4333-8333-333333333333.epub`;
    const others = `${BOB}/incoming/44444444-4444-4444-8444-444444444444.epub`;
    storage.seed("books", old, EPUB, new Date(Date.now() - 3 * 3_600_000).toISOString());
    storage.seed("books", fresh, EPUB, new Date(Date.now() - 60_000).toISOString());
    storage.seed("books", others, EPUB, new Date(Date.now() - 3 * 3_600_000).toISOString());
    const path = await upload("alice", ALICE);
    await app.request(`${HOST}/api/books/import`, post("alice", { path }));
    const keys = [...storage.objects("books").keys()];
    expect(keys).not.toContain(old);
    expect(keys).toContain(fresh);
    expect(keys).toContain(others);
  });

  it("rate limits upload tickets to 30 an hour per user", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await app.request(`${HOST}/api/uploads`, as("alice", { method: "POST" }));
      expect(res.status).toBe(200);
    }
    const limited = await app.request(`${HOST}/api/uploads`, as("alice", { method: "POST" }));
    expect(limited.status).toBe(429);
    const other = await app.request(`${HOST}/api/uploads`, as("bob", { method: "POST" }));
    expect(other.status).toBe(200);
  });

  it("gives each owner their own book and blob for identical bytes", async () => {
    const mine = await upload("alice", ALICE);
    await app.request(`${HOST}/api/books/import`, post("alice", { path: mine }));
    const theirs = await upload("bob", BOB);
    const res = await app.request(`${HOST}/api/books/import`, post("bob", { path: theirs }));
    expect(res.status).toBe(201);
    const keys = [...storage.objects("books").keys()];
    expect(keys.some((k) => k.startsWith(`${ALICE}/books/`))).toBe(true);
    expect(keys.some((k) => k.startsWith(`${BOB}/books/`))).toBe(true);
    const bobsBooks = (await (
      await app.request(`${HOST}/api/books`, as("bob"))
    ).json()) as unknown[];
    expect(bobsBooks).toHaveLength(1);
  });

  it("rejects paths outside the caller's incoming folder", async () => {
    const foreign = `${BOB}/incoming/11111111-1111-4111-8111-111111111111.epub`;
    storage.seed("books", foreign, EPUB);
    const bad = [
      foreign,
      `${ALICE}/books/${"a".repeat(64)}.epub`,
      `${ALICE}/incoming/../${BOB}/incoming/11111111-1111-4111-8111-111111111111.epub`,
      `${ALICE}/incoming/not-a-uuid.epub`,
    ];
    for (const path of bad) {
      const res = await app.request(`${HOST}/api/books/import`, post("alice", { path }));
      expect(res.status).toBe(400);
    }
    expect(storage.objects("books").has(foreign)).toBe(true);
  });

  it("requires authentication", async () => {
    const res = await app.request(`${HOST}/api/uploads`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("exports", () => {
  async function jobFor(token: string, owner: string) {
    const path = await upload(token, owner);
    const book = (await (
      await app.request(`${HOST}/api/books/import`, post(token, { path }))
    ).json()) as { id: string };
    const job = (await (
      await app.request(`${HOST}/api/books/${book.id}/workspace?targetLang=en`, as(token))
    ).json()) as { id: string };
    return { book, job };
  }

  it("returns a signed url instead of streaming a body above the response limit", async () => {
    const { job } = await jobFor("alice", ALICE);
    const res = await app.request(`${HOST}/api/jobs/${job.id}/export`, as("alice"));
    const text = await res.text();
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(text.length).toBeLessThan(2_000);
    const { url } = JSON.parse(text) as { url: string };
    expect(url).toContain(`/exports/${ALICE}/exports/${job.id}-translation.epub`);
    expect(url).toContain("exp=300");
    expect(url).toContain("download=");
    expect(
      storage.objects("exports").get(`${ALICE}/exports/${job.id}-translation.epub`)?.bytes,
    ).toBe(BIG_EXPORT);
  });

  it("names bilingual and text exports and signs them too", async () => {
    const { job } = await jobFor("alice", ALICE);
    await app.request(`${HOST}/api/jobs/${job.id}/export?layout=bilingual`, as("alice"));
    const txt = await app.request(`${HOST}/api/jobs/${job.id}/export.txt`, as("alice"));
    expect(((await txt.json()) as { url: string }).url).toContain(`${job.id}-translation.txt`);
    expect([...storage.objects("exports").keys()].toSorted()).toEqual(
      [
        `${ALICE}/exports/${job.id}-bilingual.epub`,
        `${ALICE}/exports/${job.id}-translation.txt`,
      ].toSorted(),
    );
  });

  it("removes exports older than 24 hours on the next export", async () => {
    const { job } = await jobFor("alice", ALICE);
    const old = new Date(Date.now() - EXPORT_MAX_AGE_MS - 60_000).toISOString();
    storage.seed("exports", `${ALICE}/exports/old.epub`, new Uint8Array([1]), old);
    storage.seed("exports", `${ALICE}/exports/fresh.epub`, new Uint8Array([1]));
    storage.seed("exports", `${BOB}/exports/old.epub`, new Uint8Array([1]), old);
    await app.request(`${HOST}/api/jobs/${job.id}/export`, as("alice"));
    const keys = [...storage.objects("exports").keys()];
    expect(keys).not.toContain(`${ALICE}/exports/old.epub`);
    expect(keys).toContain(`${ALICE}/exports/fresh.epub`);
    expect(keys).toContain(`${BOB}/exports/old.epub`);
  });

  it("does not export another owner's job", async () => {
    const { job } = await jobFor("alice", ALICE);
    const res = await app.request(`${HOST}/api/jobs/${job.id}/export`, as("bob"));
    expect(res.status).toBe(404);
  });
});

describe("cookie-authenticated assets", () => {
  it("serves cover, asset and chapter with the session cookie but not exports", async () => {
    const path = await upload("alice", ALICE);
    const book = (await (
      await app.request(`${HOST}/api/books/import`, post("alice", { path }))
    ).json()) as { id: string };
    const cookie = { headers: { cookie: "et_session=alice" } };
    const cover = await app.request(`${HOST}/api/books/${book.id}/cover`, cookie);
    expect(cover.status).toBe(200);
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
    const asset = await app.request(`${HOST}/api/books/${book.id}/assets/image/cover.jpg`, cookie);
    expect(asset.status).toBe(200);
    const chapter = await app.request(`${HOST}/api/books/${book.id}/chapters/ch-0`, cookie);
    expect(chapter.status).toBe(200);
    const list = await app.request(`${HOST}/api/books`, cookie);
    expect(list.status).toBe(401);
  });

  it("does not let one owner read another's cover", async () => {
    const path = await upload("alice", ALICE);
    const book = (await (
      await app.request(`${HOST}/api/books/import`, post("alice", { path }))
    ).json()) as { id: string };
    const res = await app.request(`${HOST}/api/books/${book.id}/cover`, {
      headers: { cookie: "et_session=bob" },
    });
    expect(res.status).toBe(404);
  });
});
