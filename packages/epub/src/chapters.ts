import { resolveHref } from "./hrefs.ts";
import { childElements, descendants, epubType, normalizedText } from "./xml.ts";

export interface TocEntry {
  href: string;
  title: string;
}

export interface ChapterGroup {
  title: string;
  docHrefs: string[];
}

export const FRONT_MATTER_TITLE = "Front matter";

export function readNavToc(navDoc: Document, navHref: string): TocEntry[] {
  const navs = descendants(navDoc.documentElement, "nav");
  const toc = navs.find((n) => epubType(n).includes("toc")) ?? navs[0];
  const list = toc ? childElements(toc, "ol")[0] : undefined;
  if (!list) return [];
  const entries: TocEntry[] = [];
  for (const li of childElements(list, "li")) {
    const a = childElements(li, "a")[0];
    const href = a?.getAttribute("href");
    if (!a || !href) continue;
    entries.push({ href: resolveHref(navHref, href), title: normalizedText(a) });
  }
  return entries;
}

export function readNcxLabels(ncxDoc: Document): Element[] {
  const navMap = descendants(ncxDoc.documentElement, "navMap")[0];
  if (!navMap) return [];
  return descendants(navMap, "navLabel")
    .map((label) => childElements(label, "text")[0])
    .filter((text): text is Element => text !== undefined);
}

export function readNcxToc(ncxDoc: Document, ncxHref: string): TocEntry[] {
  const navMap = descendants(ncxDoc.documentElement, "navMap")[0];
  if (!navMap) return [];
  const entries: TocEntry[] = [];
  for (const point of childElements(navMap, "navPoint")) {
    const src = childElements(point, "content")[0]?.getAttribute("src");
    const label = childElements(point, "navLabel")[0];
    const text = label ? childElements(label, "text")[0] : undefined;
    if (src && text) entries.push({ href: resolveHref(ncxHref, src), title: normalizedText(text) });
  }
  return entries;
}

export function groupChapters(
  spineHrefs: string[],
  toc: TocEntry[],
  fallbackTitle: string,
): ChapterGroup[] {
  const titles = new Map<string, string>();
  for (const entry of toc) {
    if (spineHrefs.includes(entry.href) && !titles.has(entry.href)) {
      titles.set(entry.href, entry.title || entry.href);
    }
  }
  const starts = spineHrefs.map((h, i) => ({ h, i })).filter(({ h }) => titles.has(h));
  if (starts.length === 0) return [{ title: fallbackTitle, docHrefs: spineHrefs }];

  const groups: ChapterGroup[] = [];
  const first = starts[0]?.i ?? 0;
  if (first > 0) groups.push({ title: FRONT_MATTER_TITLE, docHrefs: spineHrefs.slice(0, first) });
  starts.forEach(({ h, i }, k) => {
    const end = starts[k + 1]?.i ?? spineHrefs.length;
    groups.push({ title: titles.get(h) ?? h, docHrefs: spineHrefs.slice(i, end) });
  });
  return groups;
}
