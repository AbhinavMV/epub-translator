import {
  buildTermsPrompt,
  type TermExtractionRequest,
  type TermExtractionResult,
  type TermExtractor,
} from "@et/core";
import OpenAI from "openai";
import { mapOpenAIError, toCompletion } from "../openai.ts";
import { termsResult } from "./completion.ts";
import { TERMS_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 8_000;

export class OpenAITermExtractor implements TermExtractor {
  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: OpenAI = new OpenAI({ apiKey, maxRetries: 0 }),
  ) {}

  async extractTerms(
    req: TermExtractionRequest,
    signal: AbortSignal,
  ): Promise<TermExtractionResult> {
    const { system, user } = buildTermsPrompt(req);
    try {
      const response = await this.client.responses.create(
        {
          model: req.model || this.defaultModel,
          instructions: system,
          input: user,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          text: {
            format: { type: "json_schema", name: "terms", schema: TERMS_JSON_SCHEMA, strict: true },
          },
        },
        { signal },
      );
      return termsResult(toCompletion(response));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapOpenAIError(err);
    }
  }
}
