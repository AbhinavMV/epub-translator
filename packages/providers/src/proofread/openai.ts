import {
  buildProofreadPrompt,
  type Proofreader,
  type ProofreadRequest,
  type ProofreadResult,
} from "@et/core";
import OpenAI from "openai";
import { mapOpenAIError, toCompletion } from "../openai.ts";
import { proofreadResult } from "./completion.ts";
import { PROOFREAD_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 32_000;

export class OpenAIProofreader implements Proofreader {
  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: OpenAI = new OpenAI({ apiKey, maxRetries: 0 }),
  ) {}

  async proofread(req: ProofreadRequest, signal: AbortSignal): Promise<ProofreadResult> {
    const { system, user } = buildProofreadPrompt(req);
    try {
      const response = await this.client.responses.create(
        {
          model: req.model || this.defaultModel,
          instructions: system,
          input: user,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "proofread",
              schema: PROOFREAD_JSON_SCHEMA,
              strict: true,
            },
          },
        },
        { signal },
      );
      return proofreadResult(toCompletion(response));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapOpenAIError(err);
    }
  }
}
