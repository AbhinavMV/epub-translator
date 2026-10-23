import { posix } from "node:path";
import type { EpubAssets } from "@et/core";
import { decodeHref, splitFragment } from "./hrefs.ts";
import { entryPath, openPackage } from "./package-doc.ts";
import { DEFAULT_ZIP_LIMITS, readZip } from "./zip-reader.ts";

export class YauzlEpubAssets implements EpubAssets {
  async read(
    bytes: Uint8Array,
    href: string,
  ): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
    const { pkg } = await openPackage(bytes, DEFAULT_ZIP_LIMITS, () => () => false);
    const wanted = posix.normalize(decodeHref(splitFragment(href).path));
    const item = [...pkg.manifest.values()].find((i) => i.href === wanted);
    if (!item) return null;
    const path = entryPath(pkg, item.href);
    if (path.startsWith("../") || path.startsWith("/")) return null;
    const entries = await readZip(bytes, DEFAULT_ZIP_LIMITS, (n) => n === path);
    const data = entries.get(path);
    return data ? { bytes: data, mediaType: item.mediaType } : null;
  }
}
