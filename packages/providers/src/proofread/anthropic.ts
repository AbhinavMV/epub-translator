import Anthropic from "@anthropic-ai/sdk";
import {
  buildProofreadPrompt,
  type Proofreader,
  type ProofreadRequest,
  type ProofreadResult,
} from "@et/core";
import { mapAnthropicError, toCompletion } from "../anthropic.ts";
import { proofreadResult } from "./completion.ts";
import { PROOFREAD_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 32_000;

export class AnthropicProofreader implements Proofreader {
  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: Anthropic = new Anthropic({ apiKey, maxRetries: 0 }),
  ) {}

  async proofread(req: ProofreadRequest, signal: AbortSignal): Promise<ProofreadResult> {
    const { system, user } = buildProofreadPrompt(req);
    try {
      // Streaming lifts the SDK's 10-minute cap on non-streaming calls, which this output budget exceeds.
      const message = await this.client.messages
        .stream(
          {
            model: req.model || this.defaultModel,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages: [{ role: "user", content: user }],
            output_config: {
              effort: "medium",
              format: { type: "json_schema", schema: PROOFREAD_JSON_SCHEMA },
            },
          },
          { signal },
        )
        .finalMessage();
      return proofreadResult(toCompletion(message));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapAnthropicError(err);
    }
  }
}
