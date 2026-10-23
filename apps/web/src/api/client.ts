import {
  ApiErrorSchema,
  type BookDetail,
  BookDetailSchema,
  type BookSettings,
  BookSettingsSchema,
  type BookSummary,
  BookSummarySchema,
  type ChapterView,
  ChapterViewSchema,
  type GlossaryEntry,
  GlossaryEntrySchema,
  type JobSummary,
  JobSummarySchema,
  type ProviderInfo,
  ProviderInfoSchema,
  type SuggestGlossaryBody,
  type TranslateBody,
  type Usage,
} from "@et/contracts";

export interface EventSourceLike {
  onmessage: ((e: { data: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  close(): void;
}

export type ExportKind = "epub" | "txt";

export interface GlossarySuggestion {
  terms: GlossaryEntry[];
  usage: Usage | null;
}

export interface Api {
  listBooks(): Promise<BookSummary[]>;
  uploadBook(file: File): Promise<BookSummary>;
  getBook(id: string): Promise<BookDetail>;
  deleteBook(id: string): Promise<void>;
  saveSettings(id: string, settings: BookSettings): Promise<BookSettings>;
  suggestGlossary(bookId: string, body: SuggestGlossaryBody): Promise<GlossarySuggestion>;
  getWorkspace(bookId: string, targetLang: string): Promise<JobSummary>;
  getChapter(bookId: string, chapterId: string, jobId: string): Promise<ChapterView>;
  listProviders(): Promise<ProviderInfo[]>;
  getJob(jobId: string): Promise<JobSummary>;
  translateChapter(
    jobId: string,
    chapterId: string,
    body: TranslateBody,
  ): Promise<JobSummary | null>;
  translateAll(jobId: string, body: TranslateBody): Promise<JobSummary | null>;
  retryChapter(jobId: string, chapterId: string, body: TranslateBody): Promise<JobSummary | null>;
  clearChapter(jobId: string, chapterId: string): Promise<JobSummary | null>;
  cancelJob(jobId: string): Promise<JobSummary | null>;
  openJobEvents(jobId: string): EventSourceLike;
  exportUrl(jobId: string, kind: ExportKind): string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface Parser<T> {
  parse(value: unknown): T;
}

function browserEventSource(url: string): EventSourceLike {
  const es = new EventSource(url);
  const like: EventSourceLike = { onmessage: null, onerror: null, close: () => es.close() };
  es.onmessage = (e) => like.onmessage?.({ data: String(e.data) });
  es.onerror = (e) => like.onerror?.(e);
  return like;
}

export function createHttpApi(
  fetchFn: typeof fetch = (...args) => fetch(...args),
  makeEventSource: (url: string) => EventSourceLike = browserEventSource,
): Api {
  async function raw(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(`/api${path}`, init);
    } catch {
      throw new ApiRequestError("Cannot reach the API server", 0);
    }
    if (!res.ok) {
      const body = ApiErrorSchema.safeParse(await res.json().catch(() => null));
      throw new ApiRequestError(
        body.success ? body.data.error : `Request failed (${res.status})`,
        res.status,
      );
    }
    return res;
  }

  async function json<T>(path: string, schema: Parser<T>, init?: RequestInit): Promise<T> {
    const res = await raw(path, init);
    return schema.parse(await res.json());
  }

  const list = <T>(schema: Parser<T>): Parser<T[]> => ({
    parse: (v) => {
      if (!Array.isArray(v)) throw new ApiRequestError("Unexpected response", 0);
      return v.map((item) => schema.parse(item));
    },
  });

  async function jobOrNull(path: string, body?: unknown): Promise<JobSummary | null> {
    const res = await raw(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const parsed = JobSummarySchema.safeParse(await res.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  }

  const enc = encodeURIComponent;

  return {
    listBooks: () => json("/books", list(BookSummarySchema)),
    uploadBook(file) {
      const form = new FormData();
      form.append("file", file);
      return json("/books", BookSummarySchema, { method: "POST", body: form });
    },
    getBook: (id) => json(`/books/${enc(id)}`, BookDetailSchema),
    async deleteBook(id) {
      await raw(`/books/${enc(id)}`, { method: "DELETE" });
    },
    saveSettings: (id, settings) =>
      json(`/books/${enc(id)}/settings`, BookSettingsSchema, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      }),
    async suggestGlossary(bookId, body) {
      const res = await raw(`/books/${enc(bookId)}/glossary/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const terms = list(GlossaryEntrySchema).parse(await res.json());
      const input = res.headers.get("x-usage-input-tokens");
      const output = res.headers.get("x-usage-output-tokens");
      const usage =
        input !== null && output !== null
          ? { inputTokens: Number(input), outputTokens: Number(output) }
          : null;
      return { terms, usage };
    },
    getWorkspace: (bookId, lang) =>
      json(`/books/${enc(bookId)}/workspace?targetLang=${enc(lang)}`, JobSummarySchema),
    getChapter: (bookId, chapterId, jobId) =>
      json(
        `/books/${enc(bookId)}/chapters/${enc(chapterId)}?jobId=${enc(jobId)}`,
        ChapterViewSchema,
      ),
    listProviders: () => json("/providers", list(ProviderInfoSchema)),
    getJob: (jobId) => json(`/jobs/${enc(jobId)}`, JobSummarySchema),
    translateChapter: (jobId, chapterId, body) =>
      jobOrNull(`/jobs/${enc(jobId)}/chapters/${enc(chapterId)}/translate`, body),
    translateAll: (jobId, body) => jobOrNull(`/jobs/${enc(jobId)}/translate-all`, body),
    retryChapter: (jobId, chapterId, body) =>
      jobOrNull(`/jobs/${enc(jobId)}/chapters/${enc(chapterId)}/retry`, body),
    clearChapter: (jobId, chapterId) =>
      jobOrNull(`/jobs/${enc(jobId)}/chapters/${enc(chapterId)}/clear`),
    cancelJob: (jobId) => jobOrNull(`/jobs/${enc(jobId)}/cancel`),
    openJobEvents: (jobId) => makeEventSource(`/api/jobs/${enc(jobId)}/events`),
    exportUrl: (jobId, kind) => `/api/jobs/${enc(jobId)}/export${kind === "txt" ? ".txt" : ""}`,
  };
}
