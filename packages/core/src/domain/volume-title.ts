export interface VolumeTitle {
  seriesTitle: string;
  volumeNumber: number | null;
}

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const PART = "([上中下])";
const PART_NUMBERS: Record<string, number> = { 上: 1, 中: 2, 下: 3 };

const toNumber = (captured: string | undefined) => Number(captured);
const toPart = (captured: string | undefined) => PART_NUMBERS[captured ?? ""] ?? null;
const none = () => null;

const MARKERS: [RegExp, (captured: string | undefined) => number | null][] = [
  [/短編集/, none],
  [new RegExp(String.raw`第\s*${NUMBER}\s*巻`), toNumber],
  [new RegExp(String.raw`${NUMBER}\s*巻`), toNumber],
  [
    new RegExp(String.raw`(?<=^|[^a-z])(?:vol(?:ume)?\.?|v|ep(?:isode)?\.?)\s*${NUMBER}`, "i"),
    toNumber,
  ],
  [new RegExp(String.raw`[(\[【「]\s*${NUMBER}\s*[)\]】」]`), toNumber],
  [new RegExp(String.raw`[(\[【「]\s*${PART}\s*巻?\s*[)\]】」]`), toPart],
  [new RegExp(`${PART}巻$`), toPart],
  [new RegExp(String.raw`(?<=\s)${PART}$`), toPart],
  [new RegExp(String.raw`(?<=[^\d.])\s*${NUMBER}(?:\s*~[^~]+~)?$`), toNumber],
];

const TRAILING_LABEL = /\s*[([【][^()[\]【】\d上中下]*[)\]】]$/;
const TRAILING_SEPARATORS = /[\s,:\-・([【「]+$/;

function stripTrailingLabels(text: string): string {
  let current = text;
  for (;;) {
    const stripped = current.replace(TRAILING_LABEL, "");
    if (stripped === current || stripped === "") return current;
    current = stripped;
  }
}

export function parseVolumeTitle(title: string): VolumeTitle {
  const text = stripTrailingLabels(title.normalize("NFKC").replace(/\s+/g, " ").trim());
  for (const [marker, volumeOf] of MARKERS) {
    const match = marker.exec(text);
    if (match) {
      return {
        seriesTitle: text.slice(0, match.index).replace(TRAILING_SEPARATORS, ""),
        volumeNumber: volumeOf(match[1]),
      };
    }
  }
  return { seriesTitle: text.replace(TRAILING_SEPARATORS, ""), volumeNumber: null };
}
