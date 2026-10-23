import type { SegmentTranslation } from "@et/core";
import { decodeInto, encodeBlock, PlaceholderMismatchError, plainTextInto } from "@et/segmenter";

export function isUsable(
  translation: SegmentTranslation | undefined,
): translation is SegmentTranslation {
  return translation !== undefined && translation.status !== "failed";
}

/**
 * Reads the inline structure from `block` and writes the translation into `into`
 * (default: the block itself). Falls back to plain text so a mangled token never
 * produces broken XHTML.
 */
export function applyTranslation(
  block: Element,
  translation: SegmentTranslation,
  into: Element = block,
): void {
  const { inline } = encodeBlock(block);
  try {
    decodeInto(into, translation.text, inline);
  } catch (e) {
    if (!(e instanceof PlaceholderMismatchError)) throw e;
    plainTextInto(into, translation.text, inline);
  }
}
