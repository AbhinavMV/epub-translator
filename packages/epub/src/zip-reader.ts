import { InvalidEpubError } from "@et/core";
import yauzl from "yauzl";

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 5000,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
};

export type ZipEntries = Map<string, Uint8Array>;

function openZip(bytes: Uint8Array): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      { lazyEntries: true, validateEntrySizes: true, decodeStrings: true },
      (err, zip) => {
        if (err || !zip) reject(new InvalidEpubError(`not a valid zip: ${err?.message}`));
        else resolve(zip);
      },
    );
  });
}

function readStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(new InvalidEpubError(`cannot read ${entry.fileName}: ${err?.message}`));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", (e) => reject(new InvalidEpubError(`${entry.fileName}: ${e.message}`)));
      stream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    });
  });
}

/** Entries that `wanted` rejects are never inflated, which keeps single-chapter reads cheap. */
export async function readZip(
  bytes: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
  wanted: (name: string) => boolean = () => true,
): Promise<ZipEntries> {
  const zip = await openZip(bytes);
  try {
    if (zip.entryCount > limits.maxEntries) {
      throw new InvalidEpubError(`too many zip entries (${zip.entryCount})`);
    }
    const entries: ZipEntries = new Map();
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      const fail = (e: unknown) =>
        reject(e instanceof InvalidEpubError ? e : new InvalidEpubError(String(e)));
      zip.on("error", fail);
      zip.on("end", () => resolve());
      zip.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        if (entry.isEncrypted()) {
          fail(new InvalidEpubError(`encrypted zip entry: ${entry.fileName}`));
          return;
        }
        if (entry.uncompressedSize > limits.maxEntryBytes) {
          fail(new InvalidEpubError(`zip entry too large: ${entry.fileName}`));
          return;
        }
        total += entry.uncompressedSize;
        if (total > limits.maxTotalBytes) {
          fail(new InvalidEpubError("zip contents too large"));
          return;
        }
        if (!wanted(entry.fileName)) {
          zip.readEntry();
          return;
        }
        readStream(zip, entry).then((data) => {
          entries.set(entry.fileName, data);
          zip.readEntry();
        }, fail);
      });
      zip.readEntry();
    });
    return entries;
  } finally {
    zip.close();
  }
}
