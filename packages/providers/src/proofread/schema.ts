import { type GlossaryEntry, type ProofreadEdit, ProofreadKindSchema } from "@et/contracts";
import { z } from "zod";

export const PROOFREAD_JSON_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ProofreadKindSchema.options },
          text: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "kind", "text", "reason"],
        additionalProperties: false,
      },
    },
    notes: {
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
  required: ["edits", "notes"],
  additionalProperties: false,
} as const;

const Payload = z.object({
  edits: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      text: z.string(),
      reason: z.string().optional(),
    }),
  ),
  notes: z.array(z.object({ source: z.string(), target: z.string() })).optional(),
});

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseProofreadJson(
  raw: string,
): { edits: ProofreadEdit[]; notes: GlossaryEntry[] } | null {
  const trimmed = raw.trim();
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    const parsed = Payload.safeParse(JSON.parse(body));
    if (!parsed.success) return null;
    return {
      edits: parsed.data.edits.map((e) => {
        const kind = ProofreadKindSchema.safeParse(e.kind);
        return {
          id: e.id,
          kind: kind.success ? kind.data : "other",
          text: e.text,
          reason: (e.reason ?? "").trim(),
        };
      }),
      notes: (parsed.data.notes ?? []).flatMap((n) => {
        const source = n.source.trim();
        const target = n.target.trim();
        return source && target ? [{ source, target }] : [];
      }),
    };
  } catch {
    return null;
  }
}
