import type { TargetLanguage } from "@et/contracts";
import type { PackageDoc } from "./package-doc.ts";
import { descendants } from "./xml.ts";

const XML_NS = "http://www.w3.org/XML/1998/namespace";

export function setText(el: Element, value: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(el.ownerDocument.createTextNode(value));
}

export function formatModified(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function uniqueId(pkg: PackageDoc, base: string): string {
  let id = base;
  for (let n = 2; pkg.manifest.has(id); n++) id = `${base}-${n}`;
  return id;
}

export interface OpfEdit {
  target: TargetLanguage;
  modified: Date;
  title: string | null;
  cssPath: string;
}

export function editPackageDocument(pkg: PackageDoc, edit: OpfEdit): void {
  const doc = pkg.doc;
  const root = doc.documentElement;
  const ns = root.namespaceURI;
  const metadata = descendants(root, "metadata")[0] as Element;

  root.setAttributeNS(XML_NS, "xml:lang", edit.target.code);

  const language = descendants(metadata, "language")[0];
  if (language) setText(language, edit.target.code);

  const title = descendants(metadata, "title")[0];
  if (title && edit.title !== null) setText(title, edit.title);

  const modified = descendants(metadata, "meta").find(
    (m) => m.getAttribute("property") === "dcterms:modified",
  );
  if (modified) {
    setText(modified, formatModified(edit.modified));
  } else {
    const meta = doc.createElementNS(ns, "meta");
    meta.setAttribute("property", "dcterms:modified");
    setText(meta, formatModified(edit.modified));
    metadata.appendChild(meta);
  }

  const spine = descendants(root, "spine")[0];
  spine?.setAttribute("page-progression-direction", edit.target.dir);

  const manifest = descendants(root, "manifest")[0];
  if (manifest) {
    const item = doc.createElementNS(ns, "item");
    item.setAttribute("id", uniqueId(pkg, "et-override-css"));
    item.setAttribute("href", edit.cssPath);
    item.setAttribute("media-type", "text/css");
    manifest.appendChild(item);
  }
}
