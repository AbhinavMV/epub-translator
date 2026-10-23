import { PlaceholderMismatchError } from "./errors.ts";
import { isAtomicElement, tokenize } from "./tokens.ts";

function replaceChildren(block: Element, fragment: DocumentFragment): void {
  while (block.firstChild) block.removeChild(block.firstChild);
  block.appendChild(fragment);
}

function inlineAt(inline: Node[], n: number): Element | undefined {
  return inline[n - 1] as Element | undefined;
}

export function decodeInto(block: Element, translated: string, inline: Node[]): void {
  const doc = block.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const stack: { n: number; node: Element }[] = [];
  const used = new Set<number>();
  const current = (): Node => stack[stack.length - 1]?.node ?? fragment;

  for (const token of tokenize(translated)) {
    if (token.kind === "text") {
      current().appendChild(doc.createTextNode(token.value));
      continue;
    }
    const original = inlineAt(inline, token.n);
    if (token.kind === "close") {
      const top = stack.pop();
      if (!top || top.n !== token.n) {
        throw new PlaceholderMismatchError(`unexpected closing token </${token.n}>`);
      }
      continue;
    }
    if (!original) throw new PlaceholderMismatchError(`unknown token ${token.n}`);
    if (used.has(token.n)) throw new PlaceholderMismatchError(`duplicated token ${token.n}`);
    const wantsAtomic = token.kind === "atomic";
    if (isAtomicElement(original) !== wantsAtomic) {
      throw new PlaceholderMismatchError(`token ${token.n} has the wrong kind`);
    }
    used.add(token.n);
    if (wantsAtomic) {
      current().appendChild(original.cloneNode(true));
    } else {
      const clone = original.cloneNode(false);
      current().appendChild(clone);
      stack.push({ n: token.n, node: clone as Element });
    }
  }

  if (stack.length > 0) {
    throw new PlaceholderMismatchError(`unclosed token <${stack[stack.length - 1]?.n}>`);
  }
  for (let n = 1; n <= inline.length; n++) {
    if (!used.has(n)) throw new PlaceholderMismatchError(`missing token ${n}`);
  }
  replaceChildren(block, fragment);
}

export function plainTextInto(block: Element, translated: string, inline: Node[]): void {
  const doc = block.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const used = new Set<number>();

  for (const token of tokenize(translated)) {
    if (token.kind === "text") {
      fragment.appendChild(doc.createTextNode(token.value));
    } else if (token.kind === "atomic") {
      const original = inlineAt(inline, token.n);
      if (original && isAtomicElement(original) && !used.has(token.n)) {
        used.add(token.n);
        fragment.appendChild(original.cloneNode(true));
      }
    }
  }
  inline.forEach((node, i) => {
    if (isAtomicElement(node as Element) && !used.has(i + 1)) {
      fragment.appendChild(node.cloneNode(true));
    }
  });
  replaceChildren(block, fragment);
}
