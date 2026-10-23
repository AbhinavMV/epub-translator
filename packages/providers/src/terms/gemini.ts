import {
  buildTermsPrompt,
  type TermExtractionRequest,
  type TermExtractionResult,
  type TermExtractor,
} from "@et/core";
import { GoogleGenAI } from "@google/genai";
import { mapGeminiError, toCompletion } from "../gemini.ts";
import { termsResult } from "./completion.ts";
import { TERMS_JSON_SCHEMA } from "./schema.ts";

const MAX_OUTPUT_TOKENS = 8_000;

export class GeminiTermExtractor implements TermExtractor {
  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    private readonly client: GoogleGenAI = new GoogleGenAI({ apiKey }),
  ) {}

  async extractTerms(
    req: TermExtractionRequest,
    signal: AbortSignal,
  ): Promise<TermExtractionResult> {
    const { system, user } = buildTermsPrompt(req);
    try {
      const response = await this.client.models.generateContent({
        model: req.model || this.defaultModel,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: TERMS_JSON_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: signal,
        },
      });
      return termsResult(toCompletion(response));
    } catch (err) {
      if (signal.aborted) throw err;
      return mapGeminiError(err);
    }
  }
}
