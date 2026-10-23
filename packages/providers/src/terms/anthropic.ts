import Anthropic from "@anthropic-ai/sdk";
import {
  buildTermsPrompt,
  type TermExtractionRequest,
  type TermExtractionResult,
  type TermExtractor,
} from "@et/core";
import { mapAnthropicError, toCompletion } from "../anthropic.ts";
import { termsResult } from "./completion.ts";
import { TERMS_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 8_000;

export class AnthropicTermExtractor implements TermExtractor {
  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: Anthropic = new Anthropic({ apiKey, maxRetries: 0 }),
  ) {}

  async extractTerms(
    req: TermExtractionRequest,
    signal: AbortSignal,
  ): Promise<TermExtractionResult> {
    const { system, user } = buildTermsPrompt(req);
    try {
      const message = await this.client.messages.create(
        {
          model: req.model || this.defaultModel,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: TERMS_JSON_SCHEMA },
          },
        },
        { signal },
      );
      return termsResult(toCompletion(message));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapAnthropicError(err);
    }
  }
}
