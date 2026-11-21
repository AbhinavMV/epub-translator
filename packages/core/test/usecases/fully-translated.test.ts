import { describe, expect, it } from "vitest";
import {
  fullyTranslatedLanguage,
  type SegmentTranslation,
  type StoredBook,
} from "../../src/index.ts";
import { MemoryBooks, MemoryJobs, MemoryTranslations, sampleParsed } from "./fakes.ts";

const SEGMENT_IDS = sampleParsed.segments.map((s) => s.id);

function store() {
  return {
    books: new MemoryBooks(),
    jobs: new MemoryJobs(),
    translations: new MemoryTranslations(),
  };
}

type Store = ReturnType<typeof store>;

async function volume(s: Store, id: string): Promise<StoredBook> {
  const book: StoredBook = {
    id,
    sha256: `sha-${id}`,
    title: id,
    author: null,
    sourceLang: "ja",
    coverHref: null,
    createdAt: "2026-10-23T00:00:00.000Z",
    projectId: "p1",
    volumeNumber: Number(id.slice(1)),
  };
  await s.books.insert(book, sampleParsed);
  return book;
}

async function translate(
  s: Store,
  book: StoredBook,
  lang: string,
  statuses: SegmentTranslation["status"][] = SEGMENT_IDS.map(() => "done"),
) {
  const jobId = `${book.id}-${lang}`;
  await s.jobs.insert({
    id: jobId,
    bookId: book.id,
    targetLang: lang,
    sourceLang: "ja",
    error: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: "2026-10-23T00:00:00.000Z",
  });
  for (const [i, status] of statuses.entries()) {
    const segmentId = SEGMENT_IDS[i];
    if (segmentId) await s.translations.put(jobId, segmentId, { text: "t", status });
  }
}

describe("fullyTranslatedLanguage", () => {
  it("names the language every volume is completely translated into", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "fr");
    await translate(s, v2, "fr");
    expect(await fullyTranslatedLanguage(s, [v1, v2])).toBe("fr");
  });

  it("counts flagged segments as translated", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "en", ["done", "flagged", "flagged"]);
    expect(await fullyTranslatedLanguage(s, [v1])).toBe("en");
  });

  it("is none when a segment is pending or failed", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "en", ["done", "done"]);
    await translate(s, v2, "en", ["done", "failed", "done"]);
    expect(await fullyTranslatedLanguage(s, [v1])).toBeNull();
    expect(await fullyTranslatedLanguage(s, [v2])).toBeNull();
  });

  it("is none when volumes are complete in different languages", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "en");
    await translate(s, v2, "fr");
    expect(await fullyTranslatedLanguage(s, [v1, v2])).toBeNull();
  });

  it("is none when a volume has no translation in that language", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "en");
    expect(await fullyTranslatedLanguage(s, [v1, v2])).toBeNull();
  });

  it("is none for a project with no volumes", async () => {
    expect(await fullyTranslatedLanguage(store(), [])).toBeNull();
  });

  it("prefers English when volumes are complete in several common languages", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "fr");
    await translate(s, v1, "en");
    expect(await fullyTranslatedLanguage(s, [v1])).toBe("en");
  });

  it("falls back to another common language when English is incomplete", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "en", ["done"]);
    await translate(s, v1, "ko");
    await translate(s, v1, "de");
    expect(await fullyTranslatedLanguage(s, [v1])).toBe("de");
  });

  it("ignores translations left behind for segments the volume no longer has", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "en", ["done", "done"]);
    await s.translations.put("v1-en", "old.xhtml#0", { text: "t", status: "done" });
    expect(await fullyTranslatedLanguage(s, [v1])).toBeNull();
  });
});
