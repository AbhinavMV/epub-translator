import {
  buildProofreadPrompt,
  type Proofreader,
  type ProofreadRequest,
  type ProofreadResult,
} from "@et/core";
import { GoogleGenAI } from "@google/genai";
import { mapGeminiError, toCompletion } from "../gemini.ts";
import { proofreadResult } from "./completion.ts";
import { PROOFREAD_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 32_000;

export class GeminiProofreader implements Proofreader {
  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: GoogleGenAI = new GoogleGenAI({ apiKey }),
  ) {}

  async proofread(req: ProofreadRequest, signal: AbortSignal): Promise<ProofreadResult> {
    const { system, user } = buildProofreadPrompt(req);
    try {
      const response = await this.client.models.generateContent({
        model: req.model || this.defaultModel,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: PROOFREAD_JSON_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: signal,
        },
      });
      return proofreadResult(toCompletion(response));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapGeminiError(err);
    }
  }
}
