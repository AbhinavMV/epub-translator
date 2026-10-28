import Anthropic from "@anthropic-ai/sdk";
import type { ProviderId } from "@et/contracts";
import type {
  BatchFetch,
  BatchRequest,
  BatchTranslationProvider,
  Proofreader,
  ProofreadRequest,
  ProofreadResult,
  SegmentBatchRequest,
  SegmentBatchResult,
  TermExtractionRequest,
  TermExtractionResult,
  TermExtractor,
  TranslationProvider,
} from "@et/core";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { AnthropicProvider } from "./anthropic.ts";
import { AnthropicBatchProvider } from "./batch/anthropic.ts";
import { GeminiBatchProvider } from "./batch/gemini.ts";
import { OpenAIBatchProvider } from "./batch/openai.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProofreader } from "./proofread/anthropic.ts";
import { GeminiProofreader } from "./proofread/gemini.ts";
import { OpenAIProofreader } from "./proofread/openai.ts";
import { redactKey } from "./redact.ts";
import { AnthropicTermExtractor } from "./terms/anthropic.ts";
import { GeminiTermExtractor } from "./terms/gemini.ts";
import { OpenAITermExtractor } from "./terms/openai.ts";

export { redactKey } from "./redact.ts";

export type BrowserProviderId = Exclude<ProviderId, "fake">;

export interface BrowserProvider {
  provider: TranslationProvider;
  batch: BatchTranslationProvider;
  terms: TermExtractor;
  proofreader: Proofreader;
}

const SERVER_ONLY_HINT = " in apps/api/.env";

class Redactor {
  constructor(private readonly key: string) {}

  text(value: string): string {
    return redactKey(value, this.key).replace(SERVER_ONLY_HINT, "");
  }

  result<T extends SegmentBatchResult | TermExtractionResult | ProofreadResult>(result: T): T {
    return "cause" in result ? { ...result, cause: this.text(result.cause) } : result;
  }

  error(err: unknown): Error {
    const clean = new Error(this.text(err instanceof Error ? err.message : String(err)));
    if (err instanceof Error) clean.name = err.name;
    return clean;
  }

  async guard<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (signal?.aborted) throw err;
      throw this.error(err);
    }
  }
}

class RedactedProvider implements TranslationProvider {
  readonly id: ProviderId;
  readonly label: string;

  constructor(
    private readonly inner: TranslationProvider,
    private readonly redact: Redactor,
  ) {
    this.id = inner.id;
    this.label = inner.label;
  }

  listModels(): Promise<string[]> {
    return this.redact.guard(() => this.inner.listModels());
  }

  async translateSegments(
    req: SegmentBatchRequest,
    signal: AbortSignal,
  ): Promise<SegmentBatchResult> {
    return this.redact.result(
      await this.redact.guard(() => this.inner.translateSegments(req, signal), signal),
    );
  }
}

class RedactedBatch implements BatchTranslationProvider {
  readonly id: ProviderId;

  constructor(
    private readonly inner: BatchTranslationProvider,
    private readonly redact: Redactor,
  ) {
    this.id = inner.id;
  }

  submit(requests: BatchRequest[]): Promise<string> {
    return this.redact.guard(() => this.inner.submit(requests));
  }

  async fetch(batchId: string): Promise<BatchFetch> {
    const fetched = await this.redact.guard(() => this.inner.fetch(batchId));
    if (fetched.status === "failed") return { ...fetched, cause: this.redact.text(fetched.cause) };
    if (fetched.status === "ended") {
      const results = new Map<string, SegmentBatchResult>();
      for (const [id, r] of fetched.results) results.set(id, this.redact.result(r));
      return { status: "ended", results };
    }
    return fetched;
  }

  cancel(batchId: string): Promise<void> {
    return this.redact.guard(() => this.inner.cancel(batchId));
  }
}

class RedactedTerms implements TermExtractor {
  constructor(
    private readonly inner: TermExtractor,
    private readonly redact: Redactor,
  ) {}

  async extractTerms(
    req: TermExtractionRequest,
    signal: AbortSignal,
  ): Promise<TermExtractionResult> {
    return this.redact.result(
      await this.redact.guard(() => this.inner.extractTerms(req, signal), signal),
    );
  }
}

class RedactedProofreader implements Proofreader {
  constructor(
    private readonly inner: Proofreader,
    private readonly redact: Redactor,
  ) {}

  async proofread(req: ProofreadRequest, signal: AbortSignal): Promise<ProofreadResult> {
    return this.redact.result(
      await this.redact.guard(() => this.inner.proofread(req, signal), signal),
    );
  }
}

export function createBrowserProvider(
  id: BrowserProviderId,
  key: string,
  defaultModel: string,
): BrowserProvider {
  const redact = new Redactor(key);
  const wrap = (
    provider: TranslationProvider,
    batch: BatchTranslationProvider,
    terms: TermExtractor,
    proofreader: Proofreader,
  ): BrowserProvider => ({
    provider: new RedactedProvider(provider, redact),
    batch: new RedactedBatch(batch, redact),
    terms: new RedactedTerms(terms, redact),
    proofreader: new RedactedProofreader(proofreader, redact),
  });

  switch (id) {
    case "anthropic": {
      const client = new Anthropic({
        apiKey: key,
        maxRetries: 0,
        dangerouslyAllowBrowser: true,
        logLevel: "off",
        openTelemetry: false,
      });
      return wrap(
        new AnthropicProvider(key, defaultModel, client),
        new AnthropicBatchProvider(defaultModel, client),
        new AnthropicTermExtractor(key, defaultModel, client),
        new AnthropicProofreader(key, defaultModel, client),
      );
    }
    case "openai": {
      const client = new OpenAI({
        apiKey: key,
        maxRetries: 0,
        dangerouslyAllowBrowser: true,
        logLevel: "off",
      });
      return wrap(
        new OpenAIProvider(key, defaultModel, client),
        new OpenAIBatchProvider(defaultModel, client),
        new OpenAITermExtractor(key, defaultModel, client),
        new OpenAIProofreader(key, defaultModel, client),
      );
    }
    case "gemini": {
      const client = new GoogleGenAI({ apiKey: key });
      return wrap(
        new GeminiProvider(key, defaultModel, client),
        new GeminiBatchProvider(defaultModel, client),
        new GeminiTermExtractor(key, defaultModel, client),
        new GeminiProofreader(key, defaultModel, client),
      );
    }
  }
}
