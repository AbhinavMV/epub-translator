import type { SegmentTranslation } from "@et/core";
import { decodeInto, encodeBlock, PlaceholderMismatchError, plainTextInto } from "@et/segmenter";

export function isUsable(
  translation: SegmentTranslation | undefined,
): translation is SegmentTranslation {
  return translation !== undefined && translation.status !== "failed";
}

/** Falls back to plain text so a mangled token never produces broken XHTML. */
export function applyTranslation(block: Element, translation: SegmentTranslation): void {
  const { inline } = encodeBlock(block);
  try {
    decodeInto(block, translation.text, inline);
  } catch (e) {
    if (!(e instanceof PlaceholderMismatchError)) throw e;
    plainTextInto(block, translation.text, inline);
  }
}
