import type { BookSettings, ChapterView, Usage } from "@et/contracts";
import type {
  BatchRepository,
  BlobStore,
  BookRepository,
  BookSettingsRepository,
  ChapterRenderer,
  EpubExporter,
  EpubParser,
  Job,
  JobRepository,
  ParsedBook,
  ProviderBatch,
  ProviderBatchStatus,
  SegmentTranslation,
  StoredBook,
  TranslationRepository,
} from "../../src/index.ts";

export class MemoryBooks implements BookRepository {
  readonly rows = new Map<string, { book: StoredBook; parsed: ParsedBook }>();
  insert(book: StoredBook, parsed: ParsedBook) {
    this.rows.set(book.id, { book, parsed });
  }
  get(id: string) {
    return this.rows.get(id)?.book ?? null;
  }
  findBySha256(sha: string) {
    return [...this.rows.values()].find((r) => r.book.sha256 === sha)?.book ?? null;
  }
  getParsed(id: string) {
    return this.rows.get(id)?.parsed ?? null;
  }
  updateParsed(id: string, parsed: ParsedBook) {
    const row = this.rows.get(id);
    if (row) row.parsed = parsed;
  }
  list() {
    return [...this.rows.values()].map((r) => r.book);
  }
  delete(id: string) {
    this.rows.delete(id);
  }
}

export class MemorySettings implements BookSettingsRepository {
  readonly rows = new Map<string, BookSettings>();
  get(bookId: string): BookSettings {
    return this.rows.get(bookId) ?? { customPrompt: "", glossary: [], provider: null, model: null };
  }
  put(bookId: string, s: BookSettings) {
    this.rows.set(bookId, s);
  }
}

export class MemoryJobs implements JobRepository {
  readonly rows = new Map<string, Job>();
  insert(job: Job) {
    this.rows.set(job.id, structuredClone(job));
  }
  get(id: string) {
    return this.rows.get(id) ?? null;
  }
  findByBookAndLang(bookId: string, lang: string) {
    return (
      [...this.rows.values()].find((j) => j.bookId === bookId && j.targetLang === lang) ?? null
    );
  }
  listByBook(bookId: string) {
    return [...this.rows.values()].filter((j) => j.bookId === bookId);
  }
  update(id: string, patch: Partial<Pick<Job, "error" | "usage">>) {
    const j = this.rows.get(id);
    if (j) Object.assign(j, patch);
  }
  addUsage(id: string, u: Usage) {
    const j = this.rows.get(id);
    if (j) {
      j.usage.inputTokens += u.inputTokens;
      j.usage.outputTokens += u.outputTokens;
    }
  }
}

export class MemoryTranslations implements TranslationRepository {
  readonly rows = new Map<string, Map<string, SegmentTranslation>>();
  private job(jobId: string) {
    let m = this.rows.get(jobId);
    if (!m) {
      m = new Map();
      this.rows.set(jobId, m);
    }
    return m;
  }
  get(jobId: string, segmentId: string) {
    return this.job(jobId).get(segmentId) ?? null;
  }
  forJob(jobId: string) {
    return new Map(this.job(jobId));
  }
  put(jobId: string, segmentId: string, t: SegmentTranslation) {
    this.job(jobId).set(segmentId, t);
  }
  deleteMany(jobId: string, ids: readonly string[]) {
    for (const id of ids) this.job(jobId).delete(id);
  }
}

export class MemoryBatches implements BatchRepository {
  readonly rows = new Map<string, ProviderBatch>();
  insert(batch: ProviderBatch) {
    this.rows.set(batch.id, structuredClone(batch));
  }
  listOpen() {
    return [...this.rows.values()].filter((b) => b.status === "submitted");
  }
  openForChapter(jobId: string, chapterId: string) {
    return this.listOpen().find((b) => b.jobId === jobId && b.chapterId === chapterId) ?? null;
  }
  openForJob(jobId: string) {
    return this.listOpen().filter((b) => b.jobId === jobId);
  }
  setStatus(id: string, status: ProviderBatchStatus) {
    const b = this.rows.get(id);
    if (b) b.status = status;
  }
}

export class MemoryBlobs implements BlobStore {
  readonly rows = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.rows.set(key, bytes);
  }
  async get(key: string) {
    const b = this.rows.get(key);
    if (!b) throw new Error(`missing blob ${key}`);
    return b;
  }
  async delete(key: string) {
    this.rows.delete(key);
  }
}

export const sampleParsed: ParsedBook = {
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  chapters: [
    { id: "ch-0", index: 0, title: "第一章", docHrefs: ["a.xhtml"] },
    { id: "ch-1", index: 1, title: "第二章", docHrefs: ["b.xhtml"] },
  ],
  segments: [
    { id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一" },
    { id: "a.xhtml#1", chapterId: "ch-0", ordinal: 1, sourceText: "二<1>!?</1>" },
    { id: "b.xhtml#0", chapterId: "ch-1", ordinal: 0, sourceText: "三" },
  ],
};

export class StubParser implements EpubParser {
  calls = 0;
  constructor(private readonly result: ParsedBook | Error = sampleParsed) {}
  async parse() {
    this.calls++;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class RecordingRenderer implements ChapterRenderer {
  lastTranslations: ReadonlyMap<string, SegmentTranslation> | null = null;
  async render(
    _bytes: Uint8Array,
    book: ParsedBook,
    chapterId: string,
    translations: ReadonlyMap<string, SegmentTranslation>,
  ): Promise<ChapterView> {
    this.lastTranslations = translations;
    const ch = book.chapters.find((c) => c.id === chapterId);
    return {
      chapterId,
      index: ch?.index ?? -1,
      title: ch?.title ?? "",
      prevChapterId: null,
      nextChapterId: null,
      blocks: [],
    };
  }
}

export class RecordingExporter implements EpubExporter {
  lastTarget: string | null = null;
  lastLayout: string | null = null;
  async export(
    bytes: Uint8Array,
    _b: ParsedBook,
    _t: ReadonlyMap<string, SegmentTranslation>,
    target: { code: string },
    options: { layout: string },
  ) {
    this.lastTarget = target.code;
    this.lastLayout = options.layout;
    return new Uint8Array([...bytes, 9]);
  }
}

export const fixedClock = { now: () => new Date("2026-10-23T00:00:00.000Z") };
export function counterIds(prefix = "id") {
  let n = 0;
  return { next: () => `${prefix}${++n}` };
}
export const fakeHasher = { sha256: async (b: Uint8Array) => `sha-${b.length}-${b[0] ?? 0}` };
