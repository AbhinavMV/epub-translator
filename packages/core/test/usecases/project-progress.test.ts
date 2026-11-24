import { describe, expect, it } from "vitest";
import {
  completeLanguages,
  fullyTranslatedLanguage,
  projectProgress,
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

  it("decides from stored counts without loading any parsed volume", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "en");
    s.books.getParsed = async () => {
      throw new Error("parsed volume loaded");
    };
    expect(await fullyTranslatedLanguage(s, [v1])).toBe("en");
  });
});

describe("completeLanguages", () => {
  it("lists each volume's complete languages, English first", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    const v3 = await volume(s, "v3");
    await translate(s, v1, "fr");
    await translate(s, v1, "en");
    await translate(s, v2, "de");
    await translate(s, v3, "en", ["done"]);
    expect(await completeLanguages(s, [v1, v2, v3])).toEqual([["en", "fr"], ["de"], []]);
  });
});

describe("projectProgress", () => {
  it("has no main language when nothing is translated", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "fr", []);
    expect(await projectProgress(s, [v1])).toEqual({
      fullyTranslatedLang: null,
      mainLang: null,
      translatedVolumeCount: 0,
      volumes: [{ completeLangs: [], translatedPercent: null }],
    });
  });

  it("is empty for a project with no volumes", async () => {
    expect(await projectProgress(store(), [])).toEqual({
      fullyTranslatedLang: null,
      mainLang: null,
      translatedVolumeCount: 0,
      volumes: [],
    });
  });

  it("picks the language the most volumes are translated into and measures volumes in it", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    const v3 = await volume(s, "v3");
    await translate(s, v1, "en");
    await translate(s, v1, "fr");
    await translate(s, v2, "fr");
    await translate(s, v3, "fr", ["done", "flagged"]);
    const progress = await projectProgress(s, [v1, v2, v3]);
    expect(progress.mainLang).toBe("fr");
    expect(progress.translatedVolumeCount).toBe(2);
    expect(progress.volumes.map((v) => v.translatedPercent)).toEqual([100, 100, 66]);
  });

  it("counts completely translated volumes before started ones", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "en", ["done"]);
    await translate(s, v2, "en", ["done"]);
    await translate(s, v1, "fr");
    const progress = await projectProgress(s, [v1, v2]);
    expect(progress.mainLang).toBe("fr");
    expect(progress.volumes.map((v) => v.translatedPercent)).toEqual([100, 0]);
  });

  it("breaks ties by the order of the target languages, English first", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "fr", ["done"]);
    await translate(s, v2, "es", ["done"]);
    expect((await projectProgress(s, [v1, v2])).mainLang).toBe("es");
    await translate(s, v2, "en", ["done"]);
    expect((await projectProgress(s, [v1, v2])).mainLang).toBe("en");
  });

  it("names the fully translated language as the main one, with every volume translated", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const v2 = await volume(s, "v2");
    await translate(s, v1, "de");
    await translate(s, v2, "de");
    await translate(s, v1, "en", ["done", "done"]);
    await translate(s, v2, "en", ["done", "done"]);
    const progress = await projectProgress(s, [v1, v2]);
    expect(progress.fullyTranslatedLang).toBe("de");
    expect(progress.mainLang).toBe("de");
    expect(progress.translatedVolumeCount).toBe(2);
  });

  it("reports 99 rather than 100 until the last segment is translated", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    const chapterId = sampleParsed.segments[0]?.chapterId ?? "";
    await s.books.updateParsed(v1.id, {
      ...sampleParsed,
      segments: Array.from({ length: 200 }, (_, i) => ({
        id: `s${i}`,
        chapterId,
        ordinal: i,
        sourceText: "x",
      })),
    });
    await translate(s, v1, "en", []);
    for (let i = 0; i < 199; i++) {
      await s.translations.put("v1-en", `s${i}`, { text: "t", status: "done" });
    }
    expect((await projectProgress(s, [v1])).volumes[0]?.translatedPercent).toBe(99);
  });

  it("counts a volume without segments as translated, as Fully translated does", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await s.books.updateParsed(v1.id, { ...sampleParsed, segments: [] });
    await translate(s, v1, "fr", []);
    expect(await projectProgress(s, [v1])).toMatchObject({
      fullyTranslatedLang: "fr",
      mainLang: "fr",
      translatedVolumeCount: 1,
    });
  });

  it("caps a volume at 100 when its job holds translations the volume no longer has", async () => {
    const s = store();
    const v1 = await volume(s, "v1");
    await translate(s, v1, "en");
    await s.translations.put("v1-en", "gone", { text: "t", status: "done" });
    expect((await projectProgress(s, [v1])).volumes[0]?.translatedPercent).toBe(100);
  });
});
