import { LOCAL_OWNER_ID } from "@et/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  JobRunner,
  NotFoundError,
  requireBook,
  type SegmentBatchRequest,
  type TranslationProvider,
} from "../../src/index.ts";
import { fixedClock, MemoryStoreFactory, sampleParsed } from "./fakes.ts";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

const echo: TranslationProvider = {
  id: "fake",
  label: "Echo",
  listModels: async () => ["echo"],
  translateSegments: async (req: SegmentBatchRequest) => ({
    kind: "ok",
    segments: req.segments.map((s) => ({ id: s.id, text: `EN:${s.text}` })),
    usage: { inputTokens: 1, outputTokens: 1 },
  }),
};

const body = { provider: "fake" as const, model: "echo" };

async function seed(factory: MemoryStoreFactory, ownerId: string, bookId: string, jobId: string) {
  const repos = factory.forOwner(ownerId);
  await repos.books.insert(
    {
      id: bookId,
      sha256: `sha-${bookId}`,
      title: "本",
      author: null,
      sourceLang: "ja",
      coverHref: null,
      createdAt: "",
    },
    sampleParsed,
  );
  await repos.jobs.insert({
    id: jobId,
    bookId,
    targetLang: "en",
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: fixedClock.now().toISOString(),
  });
}

let factory: MemoryStoreFactory;
let runner: JobRunner;

beforeEach(async () => {
  factory = new MemoryStoreFactory();
  await seed(factory, ALICE, "book-a", "job-a");
  await seed(factory, BOB, "book-b", "job-b");
  runner = new JobRunner(
    { factory, providers: () => echo, events: { publish: () => {} }, sleep: async () => {} },
    { chapterConcurrency: 2, contextSize: 8, maxChars: 4000, maxCount: 40 },
  );
});

describe("owner-scoped repositories", () => {
  it("never expose another owner's books or jobs", async () => {
    const bob = factory.forOwner(BOB);
    expect(await bob.books.get("book-a")).toBeNull();
    expect(await bob.books.findBySha256("sha-book-a")).toBeNull();
    expect(await bob.jobs.get("job-a")).toBeNull();
    expect(await bob.books.list()).toHaveLength(1);
    await expect(requireBook(bob.books, "book-a")).rejects.toBeInstanceOf(NotFoundError);
    expect(await factory.forOwner(LOCAL_OWNER_ID).books.list()).toHaveLength(0);
  });
});

describe("JobRunner owner resolution", () => {
  it("rejects a job id that belongs to a different owner", async () => {
    await expect(runner.summary(BOB, "job-a")).rejects.toBeInstanceOf(NotFoundError);
    await expect(runner.translateChapter(BOB, "job-a", "ch-0", body)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(runner.cancel(BOB, "job-a")).rejects.toBeInstanceOf(NotFoundError);
    await runner.whenIdle();
    expect((await factory.forOwner(ALICE).translations.forJob("job-a")).size).toBe(0);
  });

  it("writes each task's results to the repositories of the owner that enqueued it", async () => {
    await runner.translateChapter(ALICE, "job-a", "ch-0", body);
    await runner.translateChapter(BOB, "job-b", "ch-1", body);
    await runner.whenIdle();

    const alice = factory.forOwner(ALICE);
    const bob = factory.forOwner(BOB);
    expect([...(await alice.translations.forJob("job-a")).keys()].sort()).toEqual([
      "a.xhtml#0",
      "a.xhtml#1",
    ]);
    expect([...(await bob.translations.forJob("job-b")).keys()]).toEqual(["b.xhtml#0"]);
    expect((await alice.jobs.get("job-a"))?.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect((await bob.jobs.get("job-b"))?.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect((await runner.summary(ALICE, "job-a")).status).toBe("idle");
  });
});
