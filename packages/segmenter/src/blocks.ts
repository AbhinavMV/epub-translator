import { encodeBlock } from "./encode.ts";
import { ELEMENT_NODE, isBlockElement, stripTokens } from "./tokens.ts";

export function hasTranslatableText(block: Element): boolean {
  return stripTokens(encodeBlock(block).text).trim() !== "";
}

export function findSegmentBlocks(body: Element): Element[] {
  const found: Element[] = [];
  collect(body, found);
  return found;
}

function collect(parent: Element, found: Element[]): void {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i] as Node;
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    if (isBlockElement(el) && !hasBlockDescendant(el)) {
      if (hasTranslatableText(el)) found.push(el);
    } else {
      collect(el, found);
    }
  }
}

function hasBlockDescendant(el: Element): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i] as Node;
    if (node.nodeType !== ELEMENT_NODE) continue;
    const child = node as Element;
    if (isBlockElement(child) || hasBlockDescendant(child)) return true;
  }
  return false;
}
