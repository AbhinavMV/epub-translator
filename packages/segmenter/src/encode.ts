import {
  CDATA_NODE,
  ELEMENT_NODE,
  escapeText,
  isAtomicElement,
  isRubyAnnotation,
  TEXT_NODE,
} from "./tokens.ts";

export interface Encoded {
  text: string;
  /** Index N-1 holds the original node behind token N. */
  inline: Node[];
}

export function encodeBlock(block: Element): Encoded {
  const inline: Node[] = [];
  const text = encodeChildren(block, inline);
  return { text, inline };
}

function encodeChildren(parent: Node, inline: Node[]): string {
  let out = "";
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i] as Node;
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) {
      const value = node.nodeValue ?? "";
      out += /^[ \t\r\n]*$/.test(value) ? " " : escapeText(value);
    } else if (node.nodeType === ELEMENT_NODE) {
      out += encodeElement(node as Element, inline);
    }
  }
  return out;
}

function encodeElement(el: Element, inline: Node[]): string {
  const name = (el.localName ?? el.tagName).toLowerCase();
  if (name === "ruby") return encodeRuby(el, inline);
  if (isRubyAnnotation(el)) return "";
  inline.push(el);
  const n = inline.length;
  if (isAtomicElement(el)) return `<x${n}/>`;
  return `<${n}>${encodeChildren(el, inline)}</${n}>`;
}

function encodeRuby(ruby: Element, inline: Node[]): string {
  let out = "";
  for (let i = 0; i < ruby.childNodes.length; i++) {
    const node = ruby.childNodes[i] as Node;
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) {
      out += escapeText(node.nodeValue ?? "");
    } else if (node.nodeType === ELEMENT_NODE) {
      const child = node as Element;
      if (isRubyAnnotation(child)) continue;
      out +=
        (child.localName ?? child.tagName).toLowerCase() === "rb"
          ? encodeChildren(child, inline)
          : encodeElement(child, inline);
    }
  }
  return out;
}
