import type { GlossaryEntry } from "@et/contracts";
import { z } from "zod";

export const TERMS_JSON_SCHEMA = {
  type: "object",
  properties: {
    terms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          note: { type: "string" },
        },
        required: ["source", "target", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["terms"],
  additionalProperties: false,
} as const;

const TermsPayload = z.object({
  terms: z.array(z.object({ source: z.string(), target: z.string(), note: z.string().optional() })),
});

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseTermsJson(raw: string): GlossaryEntry[] {
  const trimmed = raw.trim();
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    const parsed = TermsPayload.safeParse(JSON.parse(body));
    if (!parsed.success) return [];
    return parsed.data.terms.flatMap((t) => {
      const source = t.source.trim();
      const target = t.target.trim();
      const note = t.note?.trim();
      return source && target ? [{ source, target, ...(note ? { note } : {}) }] : [];
    });
  } catch {
    return [];
  }
}
