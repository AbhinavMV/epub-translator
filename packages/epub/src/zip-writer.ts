import { ZipFile } from "yazl";

export interface OutputEntry {
  name: string;
  data: Uint8Array;
}

const MIMETYPE = "application/epub+zip";

export async function writeEpubZip(entries: OutputEntry[], mtime: Date): Promise<Uint8Array> {
  const zip = new ZipFile();
  const options = { forceDosTimestamp: true, mtime };
  zip.addBuffer(Buffer.from(MIMETYPE, "ascii"), "mimetype", { ...options, compress: false });
  for (const entry of entries) {
    if (entry.name === "mimetype") continue;
    zip.addBuffer(Buffer.from(entry.data), entry.name, { ...options, compress: true });
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}
