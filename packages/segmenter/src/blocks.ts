import { encodeBlock } from "./encode.ts";
import { ELEMENT_NODE, isBlockElement, stripTokens, TEXT_NODE } from "./tokens.ts";

const RUN_CLASS = "et-run";

export function hasTranslatableText(block: Element): boolean {
  return stripTokens(encodeBlock(block).text).trim() !== "";
}

/**
 * Leaf blocks in document order. Loose inline content beside nested blocks (e.g.
 * `<div>text<p>…</p></div>`) is wrapped in `span.et-run` so it becomes a segment too;
 * the wrapping is idempotent, so re-parsing the original yields identical ids.
 */
export function findSegmentBlocks(body: Element): Element[] {
  const found: Element[] = [];
  collect(body, found);
  return found;
}

function collect(parent: Element, found: Element[]): void {
  wrapLooseRuns(parent);
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i] as Node;
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    if (isRun(el) || (isBlockElement(el) && !hasBlockDescendant(el))) {
      if (hasTranslatableText(el)) found.push(el);
    } else {
      collect(el, found);
    }
  }
}

function isRun(el: Element): boolean {
  return el.localName === "span" && el.getAttribute("class") === RUN_CLASS;
}

function isInlineLeaf(node: Node): boolean {
  if (node.nodeType === TEXT_NODE) return true;
  if (node.nodeType !== ELEMENT_NODE) return false;
  const el = node as Element;
  return !isRun(el) && !isBlockElement(el) && !hasBlockDescendant(el);
}

function wrapLooseRuns(parent: Element): void {
  if (!hasBlockDescendant(parent)) return;
  const nodes = Array.from(
    { length: parent.childNodes.length },
    (_, i) => parent.childNodes[i] as Node,
  );
  let run: Node[] = [];
  const flush = () => {
    if (run.some((n) => (n.textContent ?? "").trim() !== "")) {
      const doc = parent.ownerDocument;
      const span = doc.createElementNS(parent.namespaceURI, "span");
      span.setAttribute("class", RUN_CLASS);
      parent.insertBefore(span, run[0] as Node);
      for (const n of run) span.appendChild(n);
    }
    run = [];
  };
  for (const node of nodes) {
    if (isInlineLeaf(node)) run.push(node);
    else flush();
  }
  flush();
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
