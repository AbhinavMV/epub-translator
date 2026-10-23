export interface SegmentTranslation {
  text: string;
  status: "done" | "flagged" | "failed";
  /** Why a segment failed or was flagged, shown to the reader. */
  note?: string;
}
