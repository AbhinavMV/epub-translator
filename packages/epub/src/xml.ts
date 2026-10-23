import { InvalidEpubError } from "@et/core";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export const XHTML_NS = "http://www.w3.org/1999/xhtml";
export const EPUB_NS = "http://www.idpf.org/2007/ops";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

function decodeBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

export function parseXml(input: string | Uint8Array, href: string, mime = "text/xml"): Document {
  const text = typeof input === "string" ? input : decodeBytes(input);
  if (/<!ENTITY/i.test(text)) {
    throw new InvalidEpubError(`${href}: entity declarations are not allowed`);
  }
  if (/<!DOCTYPE[^>[]*\[/i.test(text)) {
    throw new InvalidEpubError(`${href}: DOCTYPE internal subsets are not allowed`);
  }
  const problems: string[] = [];
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") problems.push(message);
    },
  });
  let doc: Document;
  try {
    doc = parser.parseFromString(text, mime) as unknown as Document;
  } catch (e) {
    throw new InvalidEpubError(`${href}: malformed XML (${(e as Error).message})`);
  }
  if (problems.length > 0 || !doc.documentElement) {
    throw new InvalidEpubError(`${href}: malformed XML (${problems[0] ?? "no root element"})`);
  }
  return doc;
}

export function serializeXml(node: Node): string {
  return new XMLSerializer().serializeToString(node as never);
}

export function childElements(parent: Node, localName?: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i] as Node;
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (localName === undefined || (el.localName ?? el.tagName) === localName) out.push(el);
  }
  return out;
}

export function descendants(parent: Node, localName: string): Element[] {
  const out: Element[] = [];
  const walk = (node: Node) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i] as Node;
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if ((el.localName ?? el.tagName) === localName) out.push(el);
      walk(el);
    }
  };
  walk(parent);
  return out;
}

export function normalizedText(el: Element): string {
  return (el.textContent ?? "").replace(/[ \t\r\n]+/g, " ").replace(/^ | $/g, "");
}

export function epubType(el: Element): string[] {
  const value = el.getAttributeNS(EPUB_NS, "type") || el.getAttribute("epub:type") || "";
  return value.split(/\s+/).filter(Boolean);
}
