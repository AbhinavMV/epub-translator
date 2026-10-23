import { posix } from "node:path";
import { InvalidEpubError } from "@et/core";
import { decodeHref } from "./hrefs.ts";
import { childElements, descendants, normalizedText, parseXml } from "./xml.ts";
import { readZip, type ZipEntries, type ZipLimits } from "./zip-reader.ts";

export const XHTML_MEDIA_TYPE = "application/xhtml+xml";
export const NCX_MEDIA_TYPE = "application/x-dtbncx+xml";

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface PackageDoc {
  opfPath: string;
  opfDir: string;
  doc: Document;
  manifest: Map<string, ManifestItem>;
  spine: ManifestItem[];
  nav: ManifestItem | null;
  ncx: ManifestItem | null;
  title: string;
  author: string | null;
  sourceLang: string | null;
  coverHref: string | null;
}

export function entryPath(pkg: Pick<PackageDoc, "opfDir">, href: string): string {
  return pkg.opfDir === "." ? href : posix.join(pkg.opfDir, href);
}

export function requireEntry(entries: ZipEntries, path: string): Uint8Array {
  const bytes = entries.get(path);
  if (!bytes) throw new InvalidEpubError(`missing entry: ${path}`);
  return bytes;
}

function locateOpf(entries: ZipEntries): string {
  const container = parseXml(
    requireEntry(entries, "META-INF/container.xml"),
    "META-INF/container.xml",
  );
  const rootfile = descendants(container, "rootfile")[0];
  const fullPath = rootfile?.getAttribute("full-path");
  if (!fullPath) throw new InvalidEpubError("container.xml has no rootfile");
  return decodeHref(fullPath);
}

function firstText(parent: Element, localName: string): string | null {
  const el = descendants(parent, localName)[0];
  const text = el ? normalizedText(el) : "";
  return text === "" ? null : text;
}

/** Inflates only the container and OPF first, so callers can pick further entries by OPF directory. */
export async function openPackage(
  bytes: Uint8Array,
  limits: ZipLimits,
  alsoWanted: (opfDir: string) => (name: string) => boolean,
): Promise<{ entries: ZipEntries; pkg: PackageDoc }> {
  const first = await readZip(bytes, limits, (n) => n === "META-INF/container.xml");
  const opfPath = locateOpf(first);
  const wantMore = alsoWanted(posix.dirname(opfPath));
  const entries = await readZip(
    bytes,
    limits,
    (n) => n === "META-INF/container.xml" || n === opfPath || wantMore(n),
  );
  return { entries, pkg: loadPackage(entries) };
}

export function loadPackage(entries: ZipEntries): PackageDoc {
  const opfPath = locateOpf(entries);
  const doc = parseXml(requireEntry(entries, opfPath), opfPath);
  const root = doc.documentElement;
  const opfDir = posix.dirname(opfPath);

  const manifest = new Map<string, ManifestItem>();
  for (const item of descendants(root, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      href: posix.normalize(decodeHref(href)),
      mediaType: item.getAttribute("media-type") ?? "",
      properties: (item.getAttribute("properties") ?? "").split(/\s+/).filter(Boolean),
    });
  }

  const spineEl = descendants(root, "spine")[0];
  const spine: ManifestItem[] = [];
  for (const ref of spineEl ? childElements(spineEl, "itemref") : []) {
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    if (item) spine.push(item);
  }
  if (spine.length === 0) throw new InvalidEpubError("package has an empty spine");

  const items = [...manifest.values()];
  const nav = items.find((i) => i.properties.includes("nav")) ?? null;
  const ncx =
    manifest.get(spineEl?.getAttribute("toc") ?? "") ??
    items.find((i) => i.mediaType === NCX_MEDIA_TYPE) ??
    null;

  const metadata = descendants(root, "metadata")[0];
  if (!metadata) throw new InvalidEpubError("package has no metadata");
  const coverMeta = descendants(metadata, "meta").find((m) => m.getAttribute("name") === "cover");
  const cover =
    items.find((i) => i.properties.includes("cover-image")) ??
    manifest.get(coverMeta?.getAttribute("content") ?? "");

  return {
    opfPath,
    opfDir,
    doc,
    manifest,
    spine,
    nav,
    ncx,
    title: firstText(metadata, "title") ?? "Untitled",
    author: firstText(metadata, "creator"),
    sourceLang: firstText(metadata, "language") ?? (root.getAttribute("xml:lang") || null),
    coverHref: cover?.href ?? null,
  };
}
