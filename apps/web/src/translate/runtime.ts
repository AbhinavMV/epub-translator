import { CONTENTS_CHAPTER_ID, type JobSummary, type TranslateBody } from "@et/contracts";
import type { Sleep } from "@et/core";
import { type BrowserProvider, createBrowserProvider, redactKey } from "@et/providers/browser";
import type { Api } from "@/api/client";
import { KEYED_PROVIDERS, type KeyedProvider } from "@/keys/envelope";
import type { Vault } from "@/keys/vault";
import { cancelClientBatches, pollClientBatches, submitChapterBatch } from "./batch-flow";
import { suggestTermsInBrowser } from "./suggest-terms";
import type { WorkApi } from "./work-api";
import { WorkLoop } from "./work-loop";

export class KeyUnavailableError extends Error {
  constructor(provider: string) {
    super(`Add and unlock your ${provider} key under AI keys to translate.`);
    this.name = "KeyUnavailableError";
  }
}

export type RuntimeEvent = { kind: "progress"; jobId: string } | { kind: "providers" };

interface ChapterState {
  status: "queued" | "running";
  controller: AbortController;
  drive: symbol;
}

export interface RuntimeDeps {
  api: WorkApi;
  base: Pick<Api, "getJob">;
  vault: Vault;
  requestUnlock: () => Promise<void>;
  sleep: Sleep;
  concurrency?: () => number;
  createBundle?: typeof createBrowserProvider;
}

const k = (jobId: string, chapterId: string) => `${jobId}\u0000${chapterId}`;

export class ClientRuntime {
  private readonly chapters = new Map<string, ChapterState>();
  private readonly errors = new Map<string, string>();
  private readonly bundles = new Map<string, { key: string; bundle: BrowserProvider }>();
  private readonly discovered = new Map<KeyedProvider, string[]>();
  private readonly discovering = new Set<string>();
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private readonly loop: WorkLoop;
  private active = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly deps: RuntimeDeps) {
    this.loop = new WorkLoop({
      api: deps.api,
      bundleFor: (p) => this.requireBundle(p),
      redact: (p, text) => redactKey(text, deps.vault.getKey(p) ?? ""),
      sleep: deps.sleep,
      ...(deps.concurrency ? { concurrency: deps.concurrency } : {}),
    });
    deps.vault.subscribe(() => this.onVaultChange());
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  whenIdle(): Promise<void> {
    return this.active === 0 ? Promise.resolve() : new Promise((r) => this.idleWaiters.push(r));
  }

  discoveredModels(provider: KeyedProvider): string[] | undefined {
    return this.discovered.get(provider);
  }

  overlay(job: JobSummary): JobSummary {
    const progress = job.progress.map((p) => {
      const key = k(job.id, p.chapterId);
      const error = this.errors.get(key);
      if (error) return { ...p, status: "failed" as const, error };
      const live = this.chapters.get(key);
      return live ? { ...p, status: live.status, error: null } : p;
    });
    const busy = progress.some((p) => p.status === "queued" || p.status === "running");
    return { ...job, progress, status: busy ? "running" : job.status };
  }

  async translateChapter(jobId: string, chapterId: string, body: TranslateBody): Promise<void> {
    await this.start(jobId, [chapterId], body);
  }

  async translateAll(jobId: string, body: TranslateBody): Promise<void> {
    const job = await this.deps.base.getJob(jobId);
    const ordered = job.progress
      .filter((p) => p.status !== "done" && !this.chapters.has(k(jobId, p.chapterId)))
      .map((p) => p.chapterId)
      .sort((a, b) => Number(b === CONTENTS_CHAPTER_ID) - Number(a === CONTENTS_CHAPTER_ID));
    if (ordered.length > 0) await this.start(jobId, ordered, body);
  }

  abortChapter(jobId: string, chapterId: string): void {
    const state = this.chapters.get(k(jobId, chapterId));
    state?.controller.abort();
    this.chapters.delete(k(jobId, chapterId));
    this.errors.delete(k(jobId, chapterId));
    this.emit({ kind: "progress", jobId });
  }

  async cancel(jobId: string): Promise<void> {
    for (const [key, state] of this.chapters) {
      if (!key.startsWith(`${jobId}\u0000`)) continue;
      state.controller.abort();
      this.chapters.delete(key);
    }
    this.emit({ kind: "progress", jobId });
    await cancelClientBatches(this.batchDeps(), jobId).catch(() => undefined);
    this.emit({ kind: "progress", jobId });
  }

  async pollBatches(jobId: string, interactive: boolean): Promise<void> {
    if (interactive && this.deps.vault.snapshot().status !== "unlocked") {
      await this.deps.requestUnlock().catch(() => undefined);
    }
    if (this.deps.vault.snapshot().status !== "unlocked") return;
    const outcome = await pollClientBatches(this.batchDeps(), jobId, (p, text) =>
      redactKey(text, this.deps.vault.getKey(p) ?? ""),
    );
    if (outcome.progress.length > 0) this.emit({ kind: "progress", jobId });
  }

  async suggestGlossary(bookId: string, body: Parameters<typeof suggestTermsInBrowser>[2]) {
    await this.ensureKey(body.provider as KeyedProvider);
    try {
      return await suggestTermsInBrowser(
        { api: this.deps.api, bundleFor: (p) => this.requireBundle(p, body.model) },
        bookId,
        body,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        redactKey(message, this.deps.vault.getKey(body.provider as KeyedProvider) ?? ""),
      );
    }
  }

  private async ensureKey(provider: KeyedProvider): Promise<void> {
    if (this.deps.vault.snapshot().status !== "unlocked") {
      await this.deps.requestUnlock().catch(() => undefined);
    }
    if (!this.deps.vault.getKey(provider)) throw new KeyUnavailableError(provider);
  }

  private async start(jobId: string, chapterIds: string[], body: TranslateBody): Promise<void> {
    await this.ensureKey(body.provider as KeyedProvider);
    const drive = Symbol("drive");
    for (const id of chapterIds) {
      this.errors.delete(k(jobId, id));
      this.chapters.set(k(jobId, id), {
        status: "queued",
        controller: new AbortController(),
        drive,
      });
    }
    this.emit({ kind: "progress", jobId });
    this.active++;
    void this.drive(jobId, chapterIds, body, drive).finally(() => {
      this.active--;
      if (this.active > 0) return;
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    });
  }

  private async drive(
    jobId: string,
    chapterIds: string[],
    body: TranslateBody,
    drive: symbol,
  ): Promise<void> {
    const provider = body.provider as KeyedProvider;
    const run = { provider, model: body.model };
    for (const chapterId of chapterIds) {
      const key = k(jobId, chapterId);
      const state = this.chapters.get(key);
      if (!state || state.drive !== drive || state.controller.signal.aborted) continue;
      this.chapters.set(key, { ...state, status: "running" });
      this.emit({ kind: "progress", jobId });
      try {
        if (body.mode === "batch") {
          await submitChapterBatch(this.batchDeps(), jobId, chapterId, run);
        } else {
          await this.loop.runChapter(jobId, chapterId, run, {
            signal: state.controller.signal,
            onProgress: () => this.emit({ kind: "progress", jobId }),
          });
        }
      } catch (err) {
        if (state.controller.signal.aborted) continue;
        const message = err instanceof Error ? err.message : String(err);
        this.errors.set(key, redactKey(message, this.deps.vault.getKey(provider) ?? ""));
        this.dropDrive(jobId, drive);
        return;
      } finally {
        if (this.chapters.get(key)?.drive === drive) this.chapters.delete(key);
        this.emit({ kind: "progress", jobId });
      }
    }
    this.dropDrive(jobId, drive);
  }

  private dropDrive(jobId: string, drive: symbol): void {
    for (const [key, state] of this.chapters) {
      if (key.startsWith(`${jobId}\u0000`) && state.drive === drive) this.chapters.delete(key);
    }
    this.emit({ kind: "progress", jobId });
  }

  private batchDeps() {
    return { api: this.deps.api, bundleFor: (p: KeyedProvider) => this.bundleFor(p) };
  }

  private bundleFor(provider: KeyedProvider, model = ""): BrowserProvider | null {
    const key = this.deps.vault.getKey(provider);
    if (!key) return null;
    const cached = this.bundles.get(provider);
    if (cached && cached.key === key) return cached.bundle;
    const bundle = (this.deps.createBundle ?? createBrowserProvider)(provider, key, model);
    this.bundles.set(provider, { key, bundle });
    return bundle;
  }

  private requireBundle(provider: KeyedProvider, model = ""): BrowserProvider {
    const bundle = this.bundleFor(provider, model);
    if (!bundle) throw new KeyUnavailableError(provider);
    return bundle;
  }

  private onVaultChange(): void {
    const { status, keys } = this.deps.vault.snapshot();
    if (status !== "unlocked") for (const key of this.bundles.keys()) this.bundles.delete(key);
    this.emit({ kind: "providers" });
    if (status !== "unlocked") return;
    for (const { provider } of keys) {
      if (!KEYED_PROVIDERS.includes(provider) || this.discovered.has(provider)) continue;
      if (this.discovering.has(provider)) continue;
      this.discovering.add(provider);
      const bundle = this.bundleFor(provider);
      void bundle?.provider
        .listModels()
        .then((models) => {
          if (models.length > 0) this.discovered.set(provider, models);
        })
        .catch(() => undefined)
        .finally(() => {
          this.discovering.delete(provider);
          this.emit({ kind: "providers" });
        });
    }
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
