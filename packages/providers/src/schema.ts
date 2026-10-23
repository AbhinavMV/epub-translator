import { z } from "zod";

export const SEGMENTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
} as const;

const SegmentsPayload = z.object({
  segments: z.array(z.object({ id: z.string(), text: z.string() })),
});

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseSegmentsJson(raw: string): { id: string; text: string }[] {
  const trimmed = raw.trim();
  const body = FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    const parsed = SegmentsPayload.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.segments : [];
  } catch {
    return [];
  }
}
