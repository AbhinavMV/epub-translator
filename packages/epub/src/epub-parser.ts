import type { EpubParser, ParsedBook } from "@et/core";
import { buildBook } from "./book-layout.ts";
import { loadPackage } from "./package-doc.ts";
import { DEFAULT_ZIP_LIMITS, readZip, type ZipLimits } from "./zip-reader.ts";

export class YauzlEpubParser implements EpubParser {
  private readonly limits: ZipLimits;

  constructor(limits: Partial<ZipLimits> = {}) {
    this.limits = { ...DEFAULT_ZIP_LIMITS, ...limits };
  }

  async parse(bytes: Uint8Array): Promise<ParsedBook> {
    const entries = await readZip(bytes, this.limits);
    return buildBook(entries, loadPackage(entries));
  }
}
