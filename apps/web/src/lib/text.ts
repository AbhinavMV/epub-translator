import type { ChapterView } from "@et/contracts";

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const rt of doc.querySelectorAll("rt, rp")) rt.remove();
  return (doc.body.textContent ?? "").trim();
}

export function chapterText(view: ChapterView, side: "source" | "target"): string {
  const parts: string[] = [];
  for (const b of view.blocks) {
    if (b.kind !== "segment") continue;
    const html = side === "source" ? b.sourceHtml : b.targetHtml;
    if (html) parts.push(htmlToText(html));
  }
  return parts.join("\n\n");
}

export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
