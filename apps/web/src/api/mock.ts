import type {
  BookDetail,
  BookSettings,
  BookSummary,
  ChapterBlock,
  ChapterProgress,
  ChapterView,
  JobEvent,
  JobSummary,
  ProviderInfo,
  SegmentStatus,
} from "@et/contracts";
import type { Api, EventSourceLike } from "./client";

type Pair = readonly [ja: string, en: string];

interface MockChapter {
  id: string;
  title: string;
  heading: string;
  pairs: readonly Pair[];
}

const CHAPTERS: readonly MockChapter[] = [
  {
    id: "c1",
    title: "第一章 婚約者の様子がおかしい",
    heading: "第一章　婚約者の様子がおかしい",
    pairs: [
      [
        "朝の教室には、まだ誰も来ていなかった。窓から差し込む光が、机の上に長い影を落としている。",
        "The classroom was still empty in the morning. Light streaming through the window cast long shadows across the desks.",
      ],
      ["「おはよう、エマちゃん。今日は早いんだね」", "“Good morning, Emma. You’re early today.”"],
      [
        "彼女は少しだけ顔を赤くして、視線を逸らした。その仕草がどこか不自然で、俺は首を傾げた。",
        "She blushed slightly and looked away. The gesture felt oddly unnatural, and I tilted my head.",
      ],
      ["「べ、別に。ちょっと眠れなかっただけ」", "“N-nothing. I just couldn’t sleep very well.”"],
      [
        "そう言いながらも、彼女の手は落ち着きなく鞄の紐を弄んでいる。",
        "Even as she said it, her hands fidgeted restlessly with the strap of her bag.",
      ],
      [
        "窓の外では、桜の花びらがゆっくりと舞い落ちていた。春は、もうすぐそこまで来ている。",
        "Outside the window, cherry petals drifted slowly down. Spring was almost upon us.",
      ],
    ],
  },
  {
    id: "c2",
    title: "第二章 待ちに待ったバレンタイン",
    heading: "第二章　待ちに待ったバレンタイン",
    pairs: [
      [
        "二月に入ると、街は一斉に甘い香りに包まれた。どの店のショーウィンドウにも赤いリボンが踊っている。",
        "When February arrived, the town was wrapped in a sweet fragrance. Red ribbons danced in every shop window.",
      ],
      ["「ねえ、チョコレートは好き？」", "“Hey, do you like chocolate?”"],
      [
        "唐突な質問に、俺は思わず箸を止めた。",
        "At the sudden question, I stopped my chopsticks without meaning to.",
      ],
      ["「嫌いじゃないけど、どうして急に？」", "“I don’t dislike it, but why so suddenly?”"],
      [
        "彼女は答えず、ただ楽しそうに笑っている。その笑顔の意味を、俺はまだ知らなかった。",
        "She didn’t answer, only smiling happily. I still didn’t know what that smile meant.",
      ],
      [
        "夕暮れの帰り道、二人の影は並んで長く伸びていた。",
        "On the walk home at dusk, our two shadows stretched out long side by side.",
      ],
    ],
  },
  {
    id: "c3",
    title: "エピローグ",
    heading: "エピローグ",
    pairs: [
      [
        "あの日から、世界は少しだけ違って見えるようになった。",
        "Since that day, the world has looked just a little different.",
      ],
      [
        "朝のホームも、放課後の図書室も、隣に誰かがいるだけで特別な場所になる。",
        "The platform in the morning, the library after school, any place becomes special just because someone is beside you.",
      ],
      ["「これからも、よろしくね」", "“Let’s keep taking care of each other from now on.”"],
      ["差し出された手を、俺は静かに握り返した。", "I quietly took the hand she held out."],
      [
        "春の風が、二人の間をやさしく吹き抜けていった。",
        "A spring breeze gently passed between the two of us.",
      ],
    ],
  },
];

const ORNAMENT =
  '<svg viewBox="0 0 120 12" width="120" height="12" role="img" aria-label="ornament"><path d="M0 6h50M70 6h50" stroke="currentColor" stroke-width="1" opacity="0.4"/><circle cx="60" cy="6" r="3" fill="currentColor" opacity="0.6"/></svg>';

const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    configured: true,
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    defaultModel: "claude-sonnet-5-5",
    termsModel: "claude-haiku-5-5",
    supportsBatch: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    configured: false,
    models: ["gpt-5.1"],
    defaultModel: "gpt-5.1",
    supportsBatch: false,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    configured: false,
    models: ["gemini-3-pro"],
    defaultModel: "gemini-3-pro",
    supportsBatch: false,
  },
  {
    id: "fake",
    label: "Fake (offline test)",
    configured: true,
    models: ["fake-1"],
    defaultModel: "fake-1",
    supportsBatch: true,
  },
];

function coverFor(title: string): string {
  const glyph = title.slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a37a"/><stop offset="1" stop-color="#b4532a"/></linearGradient></defs><rect width="200" height="300" fill="url(#g)"/><text x="100" y="165" font-size="54" text-anchor="middle" fill="#fff8ee" font-family="serif">${glyph}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

class MockSource implements EventSourceLike {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(private readonly onClose: () => void) {}
  close() {
    this.onClose();
  }
}

interface SegState {
  html: string;
  status: SegmentStatus;
}

export function createMockApi(): Api {
  const books = new Map<string, { summary: BookSummary; settings: BookSettings }>();
  const jobs = new Map<string, JobSummary>();
  const segs = new Map<string, SegState>();
  const sources = new Map<string, Set<MockSource>>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const queues = new Map<string, string[]>();
  const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const segCount = CHAPTERS.reduce((n, c) => n + c.pairs.length, 0);
  const addBook = (id: string, title: string) => {
    books.set(id, {
      summary: {
        id,
        title,
        author: "Sample Author",
        sourceLang: "ja",
        coverUrl: coverFor(title),
        chapterCount: CHAPTERS.length,
        segmentCount: segCount,
        createdAt: new Date().toISOString(),
      },
      settings: { customPrompt: "", glossary: [], provider: null, model: null },
    });
  };
  addBook("mock-book", "お隣の天使様 (sample)");

  const emit = (jobId: string, event: JobEvent) => {
    for (const s of sources.get(jobId) ?? []) s.onmessage?.({ data: JSON.stringify(event) });
  };

  const segId = (c: MockChapter, i: number) => `${c.id}-s${i}`;
  const segKey = (jobId: string, id: string) => `${jobId}:${id}`;

  const recompute = (job: JobSummary): JobSummary => {
    const running = job.progress.some((p) => ["running", "queued", "submitted"].includes(p.status));
    const allDone = job.progress.every((p) => p.status === "done");
    const done = job.progress.filter((p) => p.status === "done");
    const titles = {
      book: done.length > 0 ? "The Angel Next Door (sample)" : null,
      chapters: Object.fromEntries(
        done.map((p) => [p.chapterId, `Chapter ${p.chapterId.replace(/\D+/g, "")} (translated)`]),
      ),
    };
    return { ...job, titles, status: running ? "running" : allDone ? "done" : "idle" };
  };

  const progressFor = (jobId: string, c: MockChapter, status: ChapterProgress["status"]) => {
    let done = 0;
    let flagged = 0;
    for (let i = 0; i < c.pairs.length; i++) {
      const s = segs.get(segKey(jobId, segId(c, i)));
      if (s?.status === "done") done++;
      if (s?.status === "flagged") flagged++;
    }
    return {
      chapterId: c.id,
      status,
      done: done + flagged,
      flagged,
      failed: 0,
      total: c.pairs.length,
      error: null,
    } satisfies ChapterProgress;
  };

  const setChapterProgress = (jobId: string, p: ChapterProgress) => {
    const job = jobs.get(jobId);
    if (!job) return;
    const next = recompute({
      ...job,
      progress: job.progress.map((x) => (x.chapterId === p.chapterId ? p : x)),
    });
    jobs.set(jobId, next);
    emit(jobId, { type: "chapter.progress", jobId, progress: p });
    emit(jobId, { type: "job.status", job: next });
  };

  const pump = (jobId: string) => {
    if (timers.has(jobId)) return;
    let current: MockChapter | undefined;
    let index = 0;
    const timer = setInterval(() => {
      if (!current) {
        const id = queues.get(jobId)?.shift();
        current = CHAPTERS.find((c) => c.id === id);
        index = 0;
        if (!current) {
          clearInterval(timer);
          timers.delete(jobId);
          return;
        }
        setChapterProgress(jobId, progressFor(jobId, current, "running"));
        return;
      }
      const pair = current.pairs[index];
      if (!pair) return;
      const id = segId(current, index);
      const flagged = current.id === "c2" && index === 2;
      const status: SegmentStatus = flagged ? "flagged" : "done";
      segs.set(segKey(jobId, id), { html: `<p>${pair[1]}</p>`, status });
      emit(jobId, { type: "segment.done", jobId, chapterId: current.id, segmentId: id, status });
      index++;
      const last = index >= current.pairs.length;
      setChapterProgress(
        jobId,
        progressFor(jobId, current, last ? (current.id === "c2" ? "partial" : "done") : "running"),
      );
      if (last) current = undefined;
    }, 650);
    timers.set(jobId, timer);
  };

  const enqueue = (jobId: string, chapterIds: string[]) => {
    const queue = queues.get(jobId) ?? [];
    queues.set(jobId, queue);
    for (const id of chapterIds) {
      const c = CHAPTERS.find((x) => x.id === id);
      if (!c || queue.includes(id)) continue;
      queue.push(id);
      setChapterProgress(jobId, progressFor(jobId, c, "queued"));
    }
    pump(jobId);
    return jobs.get(jobId) ?? null;
  };

  const batchKey = (jobId: string, chapterId: string) => `${jobId}:${chapterId}`;

  const submitBatch = (jobId: string, chapterIds: string[]) => {
    for (const id of chapterIds) {
      const c = CHAPTERS.find((x) => x.id === id);
      const k = batchKey(jobId, id);
      if (!c || batchTimers.has(k)) continue;
      setChapterProgress(jobId, progressFor(jobId, c, "submitted"));
      batchTimers.set(
        k,
        setTimeout(() => {
          batchTimers.delete(k);
          c.pairs.forEach((pair, i) => {
            const segmentId = segId(c, i);
            segs.set(segKey(jobId, segmentId), { html: `<p>${pair[1]}</p>`, status: "done" });
            emit(jobId, {
              type: "segment.done",
              jobId,
              chapterId: c.id,
              segmentId,
              status: "done",
            });
          });
          setChapterProgress(jobId, progressFor(jobId, c, "done"));
        }, 6000),
      );
    }
    return jobs.get(jobId) ?? null;
  };

  const start = (jobId: string, chapterIds: string[], mode: string | undefined) =>
    mode === "batch" ? submitBatch(jobId, chapterIds) : enqueue(jobId, chapterIds);

  const clear = (jobId: string, chapterId: string) => {
    const c = CHAPTERS.find((x) => x.id === chapterId);
    if (!c) return;
    clearTimeout(batchTimers.get(batchKey(jobId, chapterId)));
    batchTimers.delete(batchKey(jobId, chapterId));
    for (let i = 0; i < c.pairs.length; i++) segs.delete(segKey(jobId, segId(c, i)));
    setChapterProgress(jobId, progressFor(jobId, c, "idle"));
  };

  const api: Api = {
    listBooks: () => delay([...books.values()].map((b) => b.summary)),
    async uploadBook(file) {
      const id = `mock-${books.size + 1}`;
      addBook(id, file.name.replace(/\.epub$/i, ""));
      const book = books.get(id);
      if (!book) throw new Error("unreachable");
      return delay(book.summary, 700);
    },
    async getBook(id): Promise<BookDetail> {
      const book = books.get(id);
      if (!book) throw new Error("Book not found");
      return delay({
        ...book.summary,
        settings: book.settings,
        chapters: CHAPTERS.map((c, index) => ({
          id: c.id,
          index,
          title: c.title,
          segmentCount: c.pairs.length,
          charCount: c.pairs.reduce((n, p) => n + p[0].length, 0),
        })),
      });
    },
    async deleteBook(id) {
      books.delete(id);
      await delay(null);
    },
    async saveSettings(id, settings) {
      const book = books.get(id);
      if (book) book.settings = settings;
      return delay(settings);
    },
    async suggestGlossary() {
      return delay(
        {
          terms: [
            { source: "天使様", target: "Angel", note: "nickname for Mahiru" },
            { source: "椎名真昼", target: "Mahiru Shiina", note: "female lead" },
            { source: "藤宮周", target: "Amane Fujimiya", note: "protagonist" },
          ],
          usage: { inputTokens: 5120, outputTokens: 210 },
        },
        900,
      );
    },
    async getWorkspace(bookId, targetLang) {
      const id = `job-${bookId}-${targetLang}`;
      let job = jobs.get(id);
      if (!job) {
        job = {
          id,
          bookId,
          targetLang,
          status: "idle",
          error: null,
          progress: CHAPTERS.map((c) => ({
            chapterId: c.id,
            status: "idle",
            done: 0,
            flagged: 0,
            failed: 0,
            total: c.pairs.length,
            error: null,
          })),
          titles: { book: null, chapters: {} },
          usage: { inputTokens: 0, outputTokens: 0 },
          createdAt: new Date().toISOString(),
        };
        jobs.set(id, job);
      }
      return delay(job);
    },
    async getJob(jobId) {
      const job = jobs.get(jobId);
      if (!job) throw new Error("Job not found");
      return delay(job, 40);
    },
    async getChapter(_bookId, chapterId, jobId): Promise<ChapterView> {
      const idx = CHAPTERS.findIndex((c) => c.id === chapterId);
      const c = CHAPTERS[idx];
      if (!c) throw new Error("Chapter not found");
      const blocks: ChapterBlock[] = [
        { kind: "static", html: `<h1>${c.heading}</h1>` },
        { kind: "static", html: ORNAMENT },
        ...c.pairs.map((pair, i): ChapterBlock => {
          const s = segs.get(segKey(jobId, segId(c, i)));
          return {
            kind: "segment",
            id: segId(c, i),
            sourceHtml: `<p>${pair[0]}</p>`,
            targetHtml: s?.html ?? null,
            status: s?.status ?? "pending",
          };
        }),
      ];
      return delay({
        chapterId,
        index: idx,
        title: c.title,
        prevChapterId: CHAPTERS[idx - 1]?.id ?? null,
        nextChapterId: CHAPTERS[idx + 1]?.id ?? null,
        part: 0,
        partCount: 1,
        blocks,
      });
    },
    listProviders: () => delay(PROVIDERS),
    translateChapter: (jobId, chapterId, body) => delay(start(jobId, [chapterId], body.mode), 60),
    translateAll: (jobId, body) =>
      delay(
        start(
          jobId,
          CHAPTERS.map((c) => c.id),
          body.mode,
        ),
        60,
      ),
    retryChapter(jobId, chapterId, body) {
      clear(jobId, chapterId);
      return delay(start(jobId, [chapterId], body.mode), 60);
    },
    async clearChapter(jobId, chapterId) {
      clear(jobId, chapterId);
      return delay(jobs.get(jobId) ?? null, 60);
    },
    async cancelJob(jobId) {
      const timer = timers.get(jobId);
      if (timer) clearInterval(timer);
      timers.delete(jobId);
      queues.set(jobId, []);
      for (const [k, t] of batchTimers) {
        if (k.startsWith(`${jobId}:`)) {
          clearTimeout(t);
          batchTimers.delete(k);
        }
      }
      const job = jobs.get(jobId);
      if (job) {
        for (const p of job.progress) {
          const c = CHAPTERS.find((x) => x.id === p.chapterId);
          if (c && (p.status === "running" || p.status === "queued" || p.status === "submitted")) {
            const next = progressFor(jobId, c, p.done > 0 ? "partial" : "idle");
            setChapterProgress(jobId, next);
          }
        }
      }
      return delay(jobs.get(jobId) ?? null, 60);
    },
    openJobEvents(jobId) {
      const set = sources.get(jobId) ?? new Set<MockSource>();
      sources.set(jobId, set);
      const source: MockSource = new MockSource(() => set.delete(source));
      set.add(source);
      return source;
    },
    upload: { mode: "multipart", maxBytes: 200 * 1024 * 1024 },
    signedExports: false,
    openExport: async () => undefined,
    exportUrl: (_jobId, kind, layout = "translation") =>
      `data:text/plain;charset=utf-8,${encodeURIComponent(`mock ${kind} ${layout} export`)}`,
  };
  return api;
}
