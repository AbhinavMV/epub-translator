import type { SegmentTranslation } from "../../domain/segment.ts";
import { stripTokens } from "../../translation/placeholders.ts";
import { checkReturned, MISSING_NOTE, settleRejected } from "../../translation/settle.ts";

const MAX_NOTE_CHARS = 500;

const clip = (note: string | undefined): string | undefined =>
  note === undefined ? undefined : note.slice(0, MAX_NOTE_CHARS);

/**
 * Results from a client are claims, not facts: a "done" translation is only kept when its
 * placeholder tokens match the source, and flagged text never carries tokens.
 */
export function vetClientResults(
  sources: ReadonlyMap<string, { id: string; sourceText: string }>,
  claimed: ReadonlyMap<string, SegmentTranslation>,
): Map<string, SegmentTranslation> {
  const claimedDone: { id: string; text: string }[] = [];
  const sourceList: { id: string; text: string }[] = [];
  for (const [id, t] of claimed) {
    const source = sources.get(id);
    if (source && t.status === "done") {
      claimedDone.push({ id, text: t.text });
      sourceList.push({ id, text: source.sourceText });
    }
  }
  const { accepted, rejected } = checkReturned(sourceList, claimedDone);
  const settled = new Map([...accepted, ...settleRejected(rejected)]);

  const vetted = new Map<string, SegmentTranslation>();
  for (const [id, t] of claimed) {
    if (t.status === "done") {
      const result = settled.get(id);
      if (result) vetted.set(id, result);
    } else if (t.status === "flagged" && t.text.trim() !== "") {
      const note = clip(t.note);
      vetted.set(id, {
        text: stripTokens(t.text),
        status: "flagged",
        ...(note === undefined ? {} : { note }),
      });
    } else {
      vetted.set(id, { text: "", status: "failed", note: clip(t.note) ?? MISSING_NOTE });
    }
  }
  return vetted;
}
